import { env } from 'node:process';

import { PrismaService } from '../../../../common/database/prisma.service.js';
import { EmailMessageRepository } from '../../application/ports/email-message.repository.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';

export class PrismaEmailMessageRepository implements EmailMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(emailMessage: EmailMessage): Promise<EmailMessage> {
    const mailboxAccountId = await this.resolveMailboxAccountId();
    const emailThreadId = await this.resolveEmailThreadId(emailMessage, mailboxAccountId);
    const data = {
      id: emailMessage.id,
      messageId: emailMessage.externalMessageId,
      mailboxAccountId,
      emailThreadId,
      direction: emailMessage.direction,
      source: emailMessage.source,
      fromEmail: emailMessage.fromEmail,
      fromName: emailMessage.fromName ?? null,
      toEmails: emailMessage.toEmails,
      ccEmails: emailMessage.ccEmails,
      subject: emailMessage.subject,
      bodyText: emailMessage.bodyText ?? null,
      bodyHtml: emailMessage.bodyHtml ?? null,
      hasAttachments: emailMessage.hasAttachments ?? false,
      attachmentCount: emailMessage.attachmentCount ?? 0,
      rawSource: emailMessage.raw ?? null,
      receivedAt: emailMessage.receivedAt,
      createdAt: emailMessage.createdAt,
      updatedAt: emailMessage.createdAt,
    };

    await this.prisma.emailMessage.upsert({
      where: { id: emailMessage.id },
      create: data,
      update: data,
    });

    return {
      ...emailMessage,
      emailThreadId: emailThreadId ?? undefined,
    };
  }

  async findById(id: string): Promise<EmailMessage | undefined> {
    const record = await this.prisma.emailMessage.findUnique({ where: { id } });
    return record ? this.toDomainWithAttachments(record) : undefined;
  }

  async findByExternalMessageId(externalMessageId: string): Promise<EmailMessage | undefined> {
    const record = await this.prisma.emailMessage.findFirst({
      where: { messageId: externalMessageId },
    });
    return record ? this.toDomainWithAttachments(record) : undefined;
  }

  async listByThreadId(threadId: string): Promise<EmailMessage[]> {
    const records = await this.prisma.emailMessage.findMany({
      where: { emailThreadId: threadId },
      orderBy: { receivedAt: 'asc' },
    });
    return this.toDomainsWithAttachments(records);
  }

  async list(): Promise<EmailMessage[]> {
    const records = await this.prisma.emailMessage.findMany({
      orderBy: { receivedAt: 'desc' },
    });
    return this.toDomainsWithAttachments(records);
  }

  async updateAttachmentSummary(emailMessageId: string, attachmentCount: number): Promise<void> {
    await this.prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: {
        hasAttachments: attachmentCount > 0,
        attachmentCount,
        updatedAt: new Date(),
      } as any,
    });
  }

  private async resolveEmailThreadId(
    emailMessage: EmailMessage,
    mailboxAccountId: string,
  ): Promise<string | null> {
    if (emailMessage.emailThreadId) {
      return emailMessage.emailThreadId;
    }

    const externalThreadId = emailMessage.threadId ?? emailMessage.externalMessageId;
    const referencedMessage = emailMessage.threadId
      ? await this.prisma.emailMessage.findFirst({
        where: {
          mailboxAccountId,
          messageId: emailMessage.threadId,
          emailThreadId: { not: null },
        },
        select: { emailThreadId: true },
      })
      : null;

    if (referencedMessage?.emailThreadId) {
      await this.touchEmailThread(referencedMessage.emailThreadId, emailMessage.receivedAt);
      return referencedMessage.emailThreadId;
    }

    const threadKey = externalThreadId || emailMessage.externalMessageId || emailMessage.id;
    const thread = await this.prisma.emailThread.upsert({
      where: {
        mailboxAccountId_threadKey: {
          mailboxAccountId,
          threadKey,
        },
      },
      create: {
        mailboxAccountId,
        threadKey,
        externalThreadId: emailMessage.threadId ?? null,
        subjectNormalized: normalizeSubject(emailMessage.subject),
        customerEmail: emailMessage.fromEmail.toLowerCase().trim(),
        latestMessageAt: emailMessage.receivedAt,
      },
      update: {
        latestMessageAt: emailMessage.receivedAt,
        subjectNormalized: normalizeSubject(emailMessage.subject),
      },
      select: { id: true },
    });

    return thread.id;
  }

  private async touchEmailThread(emailThreadId: string, latestMessageAt: Date): Promise<void> {
    await this.prisma.emailThread.update({
      where: { id: emailThreadId },
      data: { latestMessageAt },
    });
  }

  private async resolveMailboxAccountId(): Promise<string> {
    const imapUser = env.IMAP_USER;
    const imapHost = env.IMAP_HOST;

    if (imapUser && imapHost) {
      const existing = await this.prisma.mailboxAccount.findFirst({
        where: { emailAddress: imapUser, imapHost },
      });
      if (existing) return existing.id;
    }

    const system = await this.prisma.mailboxAccount.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
    if (system) return system.id;

    const created = await this.prisma.mailboxAccount.create({
      data: {
        emailAddress: imapUser ?? 'system@local',
        provider: 'imap',
        imapHost: imapHost ?? 'localhost',
        imapPort: Number(env.IMAP_PORT || 993),
        imapSecure: env.IMAP_SECURE !== 'false',
        status: 'active',
      },
      select: { id: true },
    });

    return created.id;
  }

  private async toDomainWithAttachments(record: EmailMessageRecord): Promise<EmailMessage> {
    const attachments = await this.listAttachmentsByEmailMessageIds([record.id]);
    return toDomain(record, attachments.get(record.id) ?? []);
  }

  private async toDomainsWithAttachments(records: EmailMessageRecord[]): Promise<EmailMessage[]> {
    const attachments = await this.listAttachmentsByEmailMessageIds(records.map((record) => record.id));
    return records.map((record) => toDomain(record, attachments.get(record.id) ?? []));
  }

  private async listAttachmentsByEmailMessageIds(emailMessageIds: string[]): Promise<Map<string, EmailMessage['attachments']>> {
    const result = new Map<string, EmailMessage['attachments']>();
    if (emailMessageIds.length === 0 || !(this.prisma as any).emailAttachment) {
      return result;
    }

    const records = await (this.prisma as any).emailAttachment.findMany({
      where: { emailMessageId: { in: emailMessageIds } },
      orderBy: { createdAt: 'asc' },
    });

    for (const record of records) {
      const list = result.get(record.emailMessageId) ?? [];
      list.push({
        id: record.id,
        fileName: record.originalFileName ?? record.safeFileName,
        mimeType: record.mimeType,
        fileSize: Number(record.fileSize),
        parseStatus: record.parseStatus,
        textSource: resolveTextSource(record),
        parsedTextPreview: record.parsedTextPreview ?? undefined,
        parsedText: record.parsedText ?? undefined,
        parseErrorCode: record.parseErrorCode ?? undefined,
        ocrStatus: record.ocrStatus ?? undefined,
        ocrTextPreview: record.ocrTextPreview ?? undefined,
        ocrText: record.ocrText ?? undefined,
        ocrErrorCode: record.ocrErrorCode ?? undefined,
        truncated: isTruncated(record),
        isContextCandidate: record.isContextCandidate,
      });
      result.set(record.emailMessageId, list);
    }

    return result;
  }
}

type EmailMessageRecord = {
  id: string;
  messageId: string | null;
  emailThreadId: string | null;
  direction: string;
  source: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: unknown;
  ccEmails: unknown;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  hasAttachments?: boolean;
  attachmentCount?: number;
  rawSource: string | null;
  receivedAt: Date;
  createdAt: Date;
};

function toDomain(record: EmailMessageRecord, attachments: EmailMessage['attachments'] = []): EmailMessage {
  return {
    id: record.id,
    externalMessageId: record.messageId ?? record.id,
    threadId: undefined,
    emailThreadId: record.emailThreadId ?? undefined,
    direction: record.direction as EmailMessage['direction'],
    source: record.source as EmailMessage['source'],
    fromEmail: record.fromEmail,
    fromName: record.fromName ?? undefined,
    toEmails: Array.isArray(record.toEmails) ? record.toEmails as string[] : [],
    ccEmails: Array.isArray(record.ccEmails) ? record.ccEmails as string[] : [],
    subject: record.subject ?? '',
    bodyText: record.bodyText ?? undefined,
    bodyHtml: record.bodyHtml ?? undefined,
    hasAttachments: record.hasAttachments ?? attachments.length > 0,
    attachmentCount: record.attachmentCount ?? attachments.length,
    attachments,
    raw: record.rawSource ?? undefined,
    receivedAt: record.receivedAt,
    createdAt: record.createdAt,
  };
}

function resolveTextSource(record: {
  parseStrategy?: string | null;
  ocrStatus?: string | null;
  parsedText?: string | null;
}) {
  if (record.ocrStatus === 'parsed') return 'ocr';
  if (record.parseStrategy === 'pdf_text') return 'pdf_text';
  if (record.parseStrategy === 'plain_text') return 'plain_text';
  return record.parsedText ? 'plain_text' : 'none';
}

function isTruncated(record: {
  parsedText?: string | null;
  parsedTextLength?: number | null;
  ocrText?: string | null;
}) {
  const parsedLength = record.parsedText?.length ?? 0;
  const totalLength = record.parsedTextLength ?? parsedLength;
  return totalLength > parsedLength;
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^\s*(re|fw|fwd)\s*:\s*/i, '')
    .trim()
    .toLowerCase();
}
