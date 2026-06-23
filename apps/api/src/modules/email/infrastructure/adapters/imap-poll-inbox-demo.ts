import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

import { AnalyzeEmailWithAiUseCase } from '../../application/use-cases/analyze-email-with-ai.use-case.js';
import { PollEmailCandidate, PollEmailInboxUseCase } from '../../application/use-cases/poll-email-inbox.use-case.js';
import { ReceiveInboundEmailUseCase } from '../../application/use-cases/receive-inbound-email.use-case.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import { DeepseekEmailAnalysisAdapter } from './deepseek-email-analysis.adapter.js';
import { InMemoryEmailMessageRepository } from '../repositories/in-memory-email-message.repository.js';
import { InMemoryProcessedEmailTracker } from '../repositories/in-memory-processed-email-tracker.js';
import { CreateInquiryFromEmailUseCase } from '../../../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { InMemoryInquiryRepository } from '../../../inquiry/infrastructure/repositories/in-memory-inquiry.repository.js';

interface ImapPollConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  pollIntervalMs: number;
  bootstrapMode: 'mark_existing_seen' | 'process_existing';
  aiEnabled: boolean;
  runOnce: boolean;
}

interface MailAddress {
  address?: string;
  name?: string;
}

interface ImapMessageSummary {
  uid: number;
  sequence: number;
}

function loadEnvFiles(): void {
  const currentFile = fileURLToPath(import.meta.url);
  const candidateRoots = [cwd()];
  let currentDir = dirname(currentFile);

  for (let i = 0; i < 8; i += 1) {
    candidateRoots.push(currentDir);
    currentDir = join(currentDir, '..');
  }

  for (const root of candidateRoots) {
    const envPath = join(root, '.env');
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath, override: false });
    }
  }
}

function getConfig(): ImapPollConfig {
  const missing = ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASS'].filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required IMAP config: ${missing.join(', ')}`);
  }

  const bootstrapMode = env.IMAP_POLL_BOOTSTRAP_MODE || 'mark_existing_seen';
  if (bootstrapMode !== 'mark_existing_seen' && bootstrapMode !== 'process_existing') {
    throw new Error(`Invalid IMAP_POLL_BOOTSTRAP_MODE: ${bootstrapMode}`);
  }

  return {
    host: env.IMAP_HOST as string,
    port: Number(env.IMAP_PORT || 993),
    secure: parseBoolean(env.IMAP_SECURE, true),
    user: env.IMAP_USER as string,
    pass: env.IMAP_PASS as string,
    mailbox: env.IMAP_MAILBOX || 'INBOX',
    pollIntervalMs: Number(env.IMAP_POLL_INTERVAL_MS || 10000),
    bootstrapMode,
    aiEnabled: parseBoolean(env.AI_EMAIL_ANALYSIS_ENABLED, true),
    runOnce: process.argv.includes('--once') || parseBoolean(env.IMAP_POLL_RUN_ONCE, false),
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toBuffer(source: unknown): Buffer {
  if (!source) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(source)) {
    return source;
  }

  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }

  return Buffer.from(String(source), 'utf8');
}

function firstAddress(addresses: MailAddress[] | undefined): MailAddress | undefined {
  return addresses?.find((item) => item.address);
}

function toAddressList(addresses: MailAddress[] | undefined): string[] {
  return addresses?.map((item) => item.address).filter((address): address is string => Boolean(address)) ?? [];
}

async function listMessageSummaries(client: ImapFlow, range: string): Promise<ImapMessageSummary[]> {
  const summaries: ImapMessageSummary[] = [];

  for await (const message of client.fetch(range, { uid: true })) {
    if (typeof message.uid === 'number') {
      summaries.push({
        uid: message.uid,
        sequence: message.seq,
      });
    }
  }

  return summaries;
}

async function fetchInboundEmailByUid(
  client: ImapFlow,
  mailbox: string,
  uid: number,
): Promise<PollEmailCandidate | undefined> {
  const message = await client.fetchOne(
    String(uid),
    {
      envelope: true,
      internalDate: true,
      source: true,
      uid: true,
    },
    { uid: true },
  );

  if (!message) {
    return undefined;
  }

  const sourceBuffer = toBuffer(message.source);
  const parsed = await simpleParser(sourceBuffer);
  const from = firstAddress(message.envelope?.from);
  if (!from?.address) {
    throw new Error(`Message UID ${message.uid} does not have a sender address.`);
  }

  const inboundEmail: InboundEmail = {
    messageId: parsed.messageId || `imap:${mailbox}:${message.uid}`,
    threadId: parsed.inReplyTo || parsed.references?.at(0),
    fromEmail: from.address,
    fromName: from.name,
    toEmails: toAddressList(message.envelope?.to),
    ccEmails: toAddressList(message.envelope?.cc),
    subject: message.envelope?.subject || parsed.subject || '(no subject)',
    bodyText: parsed.text,
    bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
    receivedAt: message.internalDate instanceof Date ? message.internalDate : new Date(message.internalDate || Date.now()),
    source: EmailSource.IMAP,
    raw: sourceBuffer.toString('utf8'),
  };

  return {
    identity: {
      mailbox,
      uid: message.uid,
      messageId: inboundEmail.messageId,
    },
    inboundEmail,
  };
}

async function run(): Promise<void> {
  loadEnvFiles();
  const config = getConfig();
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    logger: false,
  });

  const emailRepository = new InMemoryEmailMessageRepository();
  const inquiryRepository = new InMemoryInquiryRepository();
  const tracker = new InMemoryProcessedEmailTracker();
  const createInquiryFromEmailUseCase = new CreateInquiryFromEmailUseCase(inquiryRepository);
  const receiveInboundEmailUseCase = new ReceiveInboundEmailUseCase(
    emailRepository,
    createInquiryFromEmailUseCase,
  );
  const analyzeEmailWithAiUseCase = config.aiEnabled
    ? new AnalyzeEmailWithAiUseCase(new DeepseekEmailAnalysisAdapter())
    : undefined;
  const pollEmailInboxUseCase = new PollEmailInboxUseCase(
    tracker,
    receiveInboundEmailUseCase,
    analyzeEmailWithAiUseCase,
  );

  await client.connect();
  console.log(`Connected to ${config.host}, mailbox=${config.mailbox}`);
  console.log(`Polling every ${config.pollIntervalMs} ms`);

  let lastKnownSequence = 0;
  const lock = await client.getMailboxLock(config.mailbox);
  try {
    const status = await client.status(config.mailbox, { messages: true });
    lastKnownSequence = status.messages ?? 0;
    if (config.bootstrapMode === 'mark_existing_seen') {
      console.log(`Bootstrapped ${lastKnownSequence} existing messages as seen by sequence boundary.`);
    } else {
      lastKnownSequence = 0;
      console.log(`Bootstrap mode process_existing: existing messages may be processed.`);
    }
  } finally {
    lock.release();
  }

  while (true) {
    const pollLock = await client.getMailboxLock(config.mailbox);
    try {
      const status = await client.status(config.mailbox, { messages: true });
      const messageCount = status.messages ?? 0;
      if (messageCount <= lastKnownSequence) {
        if (config.runOnce) {
          console.log('No new messages found.');
          break;
        }
        continue;
      }

      const range = `${lastKnownSequence + 1}:*`;
      const summaries = await listMessageSummaries(client, range);
      for (const summary of summaries) {
        const identity = {
          mailbox: config.mailbox,
          uid: summary.uid,
        };
        if (await tracker.hasSeen(identity)) {
          continue;
        }

        const candidate = await fetchInboundEmailByUid(client, config.mailbox, summary.uid);
        if (!candidate) {
          continue;
        }

        const result = await pollEmailInboxUseCase.processCandidate(candidate);
        if (result.skipped) {
          continue;
        }

        console.log('--- New email processed ---');
        console.log(`EmailMessage ID: ${result.emailMessage?.id}`);
        console.log(`InquiryCase ID: ${result.inquiryCase?.id}`);
        console.log(`Inquiry status: ${result.inquiryCase?.status}`);
        console.log(`Subject: ${result.emailMessage?.subject}`);

        if (result.aiAnalysisResult?.success) {
          console.log('AI analysis:');
          console.log(JSON.stringify(result.aiAnalysisResult.analysis, null, 2));
        } else if (result.aiAnalysisResult) {
          console.log('AI analysis failed:');
          console.log(`Error code: ${result.aiAnalysisResult.errorCode}`);
          console.log(`Message: ${result.aiAnalysisResult.message}`);
          console.log(`Human review required: ${result.aiAnalysisResult.humanReviewRequired}`);
          if (result.aiAnalysisResult.rawOutput) {
            console.log('Raw AI output:');
            console.log(result.aiAnalysisResult.rawOutput);
          }
        }
      }

      lastKnownSequence = messageCount;
    } finally {
      pollLock.release();
    }

    if (config.runOnce) {
      break;
    }

    await sleep(config.pollIntervalMs);
  }

  await client.logout();
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IMAP poll inbox demo failed: ${message}`);
  exit(1);
});
