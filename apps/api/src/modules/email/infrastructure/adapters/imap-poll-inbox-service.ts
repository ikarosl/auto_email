/**
 * NestJS 服务化 IMAP 轮询入口
 *
 * 通过 Nest ApplicationContext 启动 DI 容器，从容器中获取
 * PollEmailInboxUseCase 和 Prisma 仓库，替代旧版手工 new 的方式。
 *
 * 用法: pnpm demo:poll-inbox
 *       pnpm demo:poll-inbox -- --once    (只跑一轮)
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { NestFactory } from '@nestjs/core';
import { config as loadDotenv } from 'dotenv';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

import { AppModule } from '../../../../app.module.js';
import { PrismaService } from '../../../../common/database/prisma.service.js';
import { PollEmailInboxUseCase } from '../../application/use-cases/poll-email-inbox.use-case.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import { appendFetchedEmailMetadata } from '../services/email-metadata-file-logger.js';
import { MailboxSyncService } from '../services/mailbox-sync.service.js';

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

interface PollConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  pollIntervalMs: number;
  bootstrapMode: 'mark_existing_seen' | 'process_existing';
  runOnce: boolean;
}

interface MailAddress {
  address?: string;
  name?: string;
}

interface ImapMessageSummary {
  uid: number;
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

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

function getConfig(): PollConfig {
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
    secure: env.IMAP_SECURE !== 'false',
    user: env.IMAP_USER as string,
    pass: env.IMAP_PASS as string,
    mailbox: env.IMAP_MAILBOX || 'INBOX',
    pollIntervalMs: Number(env.IMAP_POLL_INTERVAL_MS || 10000),
    bootstrapMode,
    runOnce: process.argv.includes('--once') || env.IMAP_POLL_RUN_ONCE === 'true',
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function toBuffer(source: unknown): Buffer {
  if (!source) return Buffer.alloc(0);
  if (Buffer.isBuffer(source)) return source;
  if (source instanceof Uint8Array) return Buffer.from(source);
  return Buffer.from(String(source), 'utf8');
}

function firstAddress(addresses: MailAddress[] | undefined): MailAddress | undefined {
  return addresses?.find((item) => item.address);
}

function toAddressList(addresses: MailAddress[] | undefined): string[] {
  return addresses?.map((item) => item.address).filter((a): a is string => Boolean(a)) ?? [];
}

function formatRawSource(source: Buffer): string {
  return `base64:${source.toString('base64')}`;
}

async function listMessageSummaries(
  client: ImapFlow,
  range: string,
): Promise<ImapMessageSummary[]> {
  const summaries: ImapMessageSummary[] = [];
  for await (const message of client.fetch(range, { uid: true }, { uid: true })) {
    if (typeof message.uid === 'number') {
      summaries.push({ uid: message.uid });
    }
  }
  return summaries;
}

async function fetchInboundEmail(
  client: ImapFlow,
  mailbox: string,
  uid: number,
): Promise<InboundEmail> {
  const message = await client.fetchOne(
    String(uid),
    { envelope: true, internalDate: true, source: true, uid: true },
    { uid: true },
  );

  if (!message) {
    throw new Error(`Message UID ${uid} not found.`);
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
    receivedAt: message.internalDate instanceof Date
      ? message.internalDate
      : new Date(message.internalDate || Date.now()),
    source: EmailSource.IMAP,
    raw: formatRawSource(sourceBuffer),
  };

  await appendFetchedEmailMetadata({
    mailbox,
    uid: message.uid,
    inboundEmail,
    rawSource: sourceBuffer,
    rawSizeBytes: sourceBuffer.length,
  });

  return inboundEmail;
}

function getStatusUidValidity(status: unknown): bigint | null {
  const value = (status as { uidValidity?: number | bigint | string }).uidValidity;
  if (value === undefined || value === null) return null;
  return BigInt(value);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  loadEnvFiles();
  const config = getConfig();

  // 1. 启动 NestJS DI 容器
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const syncService = app.get(MailboxSyncService);
  const pollUseCase = app.get(PollEmailInboxUseCase);

  // 2. 解析 MailboxAccount
  const mailboxAccountId = await syncService.resolveMailboxAccountId(config.user, config.host);
  const mailboxName = config.mailbox;

  // 3. 加载已有同步进度
  const existingSync = await syncService.getSyncState(mailboxAccountId, mailboxName);
  const aiEnabled = parseBoolean(env.AI_EMAIL_ANALYSIS_ENABLED, true);

  // 4. 连接 IMAP
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });
  await client.connect();
  console.log(`Connected to ${config.host}, mailbox=${mailboxName}`);

  // 5. bootstrapping: 确定起始 UID
  const lock = await client.getMailboxLock(mailboxName);
  let lastKnownUid: number;
  try {
    const status = await client.status(mailboxName, { messages: true, uidNext: true });
    const uidNext = status.uidNext ? Number(status.uidNext) : 0;
    const uidValidity = getStatusUidValidity(status);

    if (config.bootstrapMode === 'mark_existing_seen') {
      if (existingSync?.lastSeenUid !== null && existingSync?.lastSeenUid !== undefined) {
        lastKnownUid = Number(existingSync.lastSeenUid);
        console.log(`Resumed from stored sync state: lastSeenUid=${lastKnownUid}`);
      } else {
        // 首次启动：将已有邮件标记为已见，lastKnownUid = uidNext - 1
        lastKnownUid = Math.max(0, uidNext - 1);
        await syncService.updateLastSeenUid(
          mailboxAccountId, mailboxName, BigInt(lastKnownUid), uidValidity,
        );
        await syncService.markBootstrapCompleted(mailboxAccountId, mailboxName);
        console.log(`Bootstrapped: marked ${lastKnownUid} existing messages as seen.`);
      }
    } else {
      // process_existing: 从 UID 1 开始处理
      lastKnownUid = existingSync?.lastSeenUid !== null && existingSync?.lastSeenUid !== undefined
        ? Number(existingSync.lastSeenUid)
        : 0;
      console.log(`Bootstrap mode process_existing: starting from UID ${lastKnownUid}.`);
    }
  } finally {
    lock.release();
  }

  // 6. 轮询循环
  const doPoll = async (): Promise<boolean> => {
    const pollLock = await client.getMailboxLock(mailboxName);
    try {
      const status = await client.status(mailboxName, { messages: true, uidNext: true });
      const uidNext = status.uidNext ? Number(status.uidNext) : 0;
      const uidValidity = getStatusUidValidity(status);

      if (uidNext <= lastKnownUid + 1) {
        return false; // 无新邮件
      }

      const range = `${lastKnownUid + 1}:*`;
      const summaries = await listMessageSummaries(client, range);
      if (summaries.length === 0) {
        console.warn(
          `IMAP reported uidNext=${uidNext} after lastKnownUid=${lastKnownUid}, but no UID-range messages were fetched. Sync cursor was not advanced.`,
        );
        return false;
      }

      let lastHandledUid = lastKnownUid;
      for (const summary of summaries) {
        const identity = {
          mailboxAccountId,
          mailbox: mailboxName,
          uidValidity: uidValidity ?? undefined,
          uid: summary.uid,
        };

        const inboundEmail = await fetchInboundEmail(client, mailboxName, summary.uid);
        const candidate = { identity, inboundEmail };

        const result = await pollUseCase.processCandidate(candidate);

        if (result.skipped) {
          lastHandledUid = summary.uid;
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
        }

        // 更新 processed UID
        await syncService.updateLastProcessedUid(
          mailboxAccountId, mailboxName, BigInt(summary.uid),
        );
        lastHandledUid = summary.uid;
      }

      if (lastHandledUid <= lastKnownUid) {
        return false;
      }

      // 更新 lastSeenUid
      lastKnownUid = lastHandledUid;
      await syncService.updateLastSeenUid(
        mailboxAccountId, mailboxName, BigInt(lastKnownUid), uidValidity,
      );

      return summaries.length > 0;
    } finally {
      pollLock.release();
    }
  };

  // 首轮立即执行
  console.log(`Polling every ${config.pollIntervalMs} ms...`);
  await doPoll();

  while (!config.runOnce) {
    await sleep(config.pollIntervalMs);
    await doPoll();
  }

  await client.logout();
  console.log('Polling finished.');
  await app.close();
  exit(0);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IMAP poll inbox service failed: ${message}`);
  exit(1);
});
