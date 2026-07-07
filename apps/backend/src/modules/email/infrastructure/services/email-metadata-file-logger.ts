import { mkdir, appendFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { cwd } from 'node:process';

import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';

interface EmailMetadataLogInput {
  mailbox: string;
  uid?: number;
  uidValidity?: bigint | null;
  inboundEmail: InboundEmail;
  rawSource?: Buffer;
  rawSizeBytes?: number;
}

export async function appendFetchedEmailMetadata(input: EmailMetadataLogInput): Promise<void> {
  const logPath = resolveEmailMetadataLogPath();
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${formatEmailMetadata(input)}\n`, 'utf8');
}

function resolveEmailMetadataLogPath(): string {
  const configuredPath = process.env.EMAIL_METADATA_LOG_PATH;
  if (configuredPath) {
    return resolve(cwd(), configuredPath);
  }

  if (basename(cwd()).toLowerCase() === 'api') {
    return resolve(cwd(), 'logs/email.txt');
  }

  return resolve(cwd(), 'apps/backend/logs/email.txt');
}

function formatEmailMetadata(input: EmailMetadataLogInput): string {
  const { inboundEmail } = input;
  const sourceData = {
    loggedAt: new Date().toISOString(),
    sourceKind: 'imap_fetch_raw_email',
    mailbox: input.mailbox,
    uid: input.uid ?? null,
    uidValidity: input.uidValidity?.toString() ?? null,
    rawSizeBytes: input.rawSizeBytes ?? null,
    rawSourceBase64: input.rawSource?.toString('base64') ?? null,
    rawSourceUtf8LossyForDebug: input.rawSource?.toString('utf8') ?? null,
    parsedEmail: {
      messageId: inboundEmail.messageId,
      threadId: inboundEmail.threadId ?? null,
      fromEmail: inboundEmail.fromEmail,
      fromName: inboundEmail.fromName ?? null,
      toEmails: inboundEmail.toEmails,
      ccEmails: inboundEmail.ccEmails,
      subject: inboundEmail.subject,
      receivedAt: inboundEmail.receivedAt.toISOString(),
      source: inboundEmail.source,
      bodyText: inboundEmail.bodyText ?? null,
      bodyHtml: inboundEmail.bodyHtml ?? null,
      rawStoredValue: inboundEmail.raw ?? null,
    },
  };

  return JSON.stringify(sourceData);
}
