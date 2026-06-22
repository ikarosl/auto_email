import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

interface ImapDemoConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  fetchLimit: number;
  bodyPreviewLimit: number;
  fetchUid?: number;
}

function loadEnvFiles(): void {
  const currentFile = fileURLToPath(import.meta.url);
  const candidateRoots = [
    cwd(),
    join(dirname(currentFile), '..', '..', '..', '..', '..', '..', '..'),
  ];

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

function getConfig(): ImapDemoConfig {
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
    fetchLimit: Number(env.IMAP_FETCH_LIMIT || 5),
    bodyPreviewLimit: Number(env.IMAP_BODY_PREVIEW_LIMIT || 8000),
    fetchUid: getRequestedUid(),
  };
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

function formatDate(value: Date | string | undefined): string {
  if (!value) {
    return '(unknown)';
  }

  return value instanceof Date ? value.toISOString() : value;
}

function formatAddressList(
  addresses: Array<{ address?: string; name?: string }> | undefined,
): string {
  return addresses?.map((item) => item.name ? `${item.name} <${item.address}>` : item.address).join(', ') || '(unknown)';
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

function getErrorDetail(error: unknown, key: string): string | undefined {
  if (!error || typeof error !== 'object' || !(key in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function printMessageByUid(client: ImapFlow, uid: number, previewLimit: number): Promise<void> {
  const message = await client.fetchOne(
    String(uid),
    {
      envelope: true,
      flags: true,
      internalDate: true,
      source: true,
      uid: true,
    },
    { uid: true },
  );

  if (!message) {
    console.log(`Message UID ${uid} not found.`);
    return;
  }

  const source = toBuffer(message.source);
  const parsed = await simpleParser(source);
  const text = parsed.text?.trim() || '(no plain text body)';
  const content = text.length > previewLimit
    ? `${text.slice(0, previewLimit)}\n\n[truncated: ${text.length - previewLimit} chars omitted]`
    : text;

  console.log(`UID: ${message.uid}`);
  console.log(`Date: ${formatDate(message.internalDate)}`);
  console.log(`From: ${formatAddressList(message.envelope?.from)}`);
  console.log(`To: ${formatAddressList(message.envelope?.to)}`);
  console.log(`Subject: ${message.envelope?.subject || '(no subject)'}`);
  console.log(`Flags: ${Array.from(message.flags ?? []).join(', ') || '(none)'}`);
  console.log(`Attachments: ${parsed.attachments.length}`);
  console.log('--- TEXT BODY START ---');
  console.log(content || '(empty message source)');
  console.log('--- TEXT BODY END ---');
}

async function run(): Promise<void> {
  loadEnvFiles();

  const imapConfig = getConfig();
  const client = new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: imapConfig.secure,
    auth: {
      user: imapConfig.user,
      pass: imapConfig.pass,
    },
    logger: false,
  });

  await client.connect();

  const lock = await client.getMailboxLock(imapConfig.mailbox);
  try {
    const status = await client.status(imapConfig.mailbox, {
      messages: true,
      unseen: true,
    });
    const messageCount = status.messages ?? 0;

    console.log(`Connected to ${imapConfig.host}`);
    console.log(`Mailbox: ${imapConfig.mailbox}`);
    console.log(`Messages: ${messageCount}`);
    console.log(`Unseen: ${status.unseen ?? 0}`);

    if (imapConfig.fetchUid) {
      await printMessageByUid(client, imapConfig.fetchUid, imapConfig.bodyPreviewLimit);
      return;
    }

    if (messageCount === 0) {
      return;
    }

    const start = Math.max(1, messageCount - imapConfig.fetchLimit + 1);
    const range = `${start}:*`;

    console.log(`Fetching latest messages: ${range}`);

    for await (const message of client.fetch(range, {
      envelope: true,
      flags: true,
      internalDate: true,
      uid: true,
    })) {
      const from = formatAddressList(message.envelope?.from);
      const subject = message.envelope?.subject || '(no subject)';

      console.log('---');
      console.log(`UID: ${message.uid}`);
      console.log(`Date: ${formatDate(message.internalDate)}`);
      console.log(`From: ${from}`);
      console.log(`Subject: ${subject}`);
      console.log(`Flags: ${Array.from(message.flags ?? []).join(', ') || '(none)'}`);
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IMAP demo failed: ${message}`);

  for (const key of ['code', 'response', 'responseStatus', 'serverResponse', 'authenticationFailed']) {
    const detail = getErrorDetail(error, key);
    if (detail) {
      console.error(`${key}: ${detail}`);
    }
  }

  exit(1);
});
