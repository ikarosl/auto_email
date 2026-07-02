import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

import { CreateInquiryFromEmailUseCase } from '../../../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { InMemoryInquiryRepository } from '../../../inquiry/infrastructure/repositories/in-memory-inquiry.repository.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import { ReceiveInboundEmailUseCase } from '../../application/use-cases/receive-inbound-email.use-case.js';
import { InMemoryEmailMessageRepository } from '../repositories/in-memory-email-message.repository.js';

interface ImapInquiryDemoConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  fetchUid?: number;
}

interface MailAddress {
  address?: string;
  name?: string;
}

function loadEnvFiles(): void {
  const currentFile = fileURLToPath(import.meta.url);
  const candidateRoots = [cwd(), join(dirname(currentFile), '..', '..', '..', '..', '..', '..', '..')];

  for (const root of candidateRoots) {
    const envPath = join(root, '.env');
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath, override: false });
    }
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function getRequestedUid(): number | undefined {
  const uidArg = process.argv.find((arg) => arg.startsWith('--uid='));
  const uidValue = uidArg?.slice('--uid='.length) || env.IMAP_FETCH_UID;
  if (!uidValue) {
    return undefined;
  }

  const uid = Number(uidValue);
  if (!Number.isInteger(uid) || uid < 1) {
    throw new Error(`Invalid UID: ${uidValue}`);
  }

  return uid;
}

function getConfig(): ImapInquiryDemoConfig {
  const missing = ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASS'].filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required IMAP config: ${missing.join(', ')}`);
  }

  return {
    host: env.IMAP_HOST as string,
    port: Number(env.IMAP_PORT || 993),
    secure: parseBoolean(env.IMAP_SECURE, true),
    user: env.IMAP_USER as string,
    pass: env.IMAP_PASS as string,
    mailbox: env.IMAP_MAILBOX || 'INBOX',
    fetchUid: getRequestedUid(),
  };
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

async function getLatestSequence(client: ImapFlow, mailbox: string): Promise<number | undefined> {
  const status = await client.status(mailbox, { messages: true });
  const messageCount = status.messages ?? 0;
  return messageCount > 0 ? messageCount : undefined;
}

async function fetchInboundEmail(client: ImapFlow, config: ImapInquiryDemoConfig): Promise<InboundEmail | undefined> {
  const sequenceOrUid = config.fetchUid ? String(config.fetchUid) : String(await getLatestSequence(client, config.mailbox));
  if (!sequenceOrUid || sequenceOrUid === 'undefined') {
    return undefined;
  }

  const message = await client.fetchOne(
    sequenceOrUid,
    {
      envelope: true,
      internalDate: true,
      source: true,
      uid: true,
    },
    config.fetchUid ? { uid: true } : {},
  );

  if (!message) {
    return undefined;
  }

  const parsed = await simpleParser(toBuffer(message.source));
  const from = firstAddress(message.envelope?.from);
  if (!from?.address) {
    throw new Error(`Message UID ${message.uid} does not have a sender address.`);
  }

  return {
    messageId: parsed.messageId || `imap:${config.mailbox}:${message.uid}`,
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
    raw: toBuffer(message.source).toString('utf8'),
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

  await client.connect();

  const lock = await client.getMailboxLock(config.mailbox);
  try {
    const inboundEmail = await fetchInboundEmail(client, config);
    if (!inboundEmail) {
      console.log(`No messages found in ${config.mailbox}.`);
      return;
    }

    const emailRepository = new InMemoryEmailMessageRepository();
    const inquiryRepository = new InMemoryInquiryRepository();
    const createInquiryFromEmailUseCase = new CreateInquiryFromEmailUseCase(inquiryRepository);
    const receiveInboundEmailUseCase = new ReceiveInboundEmailUseCase(
      emailRepository,
      createInquiryFromEmailUseCase,
    );

    const result = await receiveInboundEmailUseCase.execute(inboundEmail);

    console.log('Created inquiry from IMAP email.');
    console.log(`EmailMessage ID: ${result.emailMessage.id}`);
    console.log(`InquiryCase ID: ${result.inquiryCase?.id ?? '(none)'}`);
    console.log(`Inquiry status: ${result.inquiryCase?.status ?? '(none)'}`);
    if (result.skippedReason) {
      console.log(`Skipped reason: ${result.skippedReason}`);
    }
    console.log(`From: ${result.emailMessage.fromName || result.emailMessage.fromEmail} <${result.emailMessage.fromEmail}>`);
    console.log(`Subject: ${result.emailMessage.subject}`);
  } finally {
    lock.release();
    await client.logout();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IMAP to inquiry demo failed: ${message}`);
  exit(1);
});
