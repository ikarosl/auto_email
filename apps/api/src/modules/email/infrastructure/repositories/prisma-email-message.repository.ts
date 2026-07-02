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
    return record ? toDomain(record) : undefined;
  }

  async findByExternalMessageId(externalMessageId: string): Promise<EmailMessage | undefined> {
    const record = await this.prisma.emailMessage.findFirst({
      where: { messageId: externalMessageId },
    });
    return record ? toDomain(record) : undefined;
  }

  async listByThreadId(threadId: string): Promise<EmailMessage[]> {
    const records = await this.prisma.emailMessage.findMany({
      where: { emailThreadId: threadId },
      orderBy: { receivedAt: 'asc' },
    });
    return records.map(toDomain);
  }

  async list(): Promise<EmailMessage[]> {
    const records = await this.prisma.emailMessage.findMany({
      orderBy: { receivedAt: 'desc' },
    });
    return records.map(toDomain);
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
}

type PrismaEmailMessage = Awaited<ReturnType<PrismaEmailMessageRepository['list']>>[number];

function toDomain(record: {
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
  rawSource: string | null;
  receivedAt: Date;
  createdAt: Date;
}): EmailMessage {
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
    raw: record.rawSource ?? undefined,
    receivedAt: record.receivedAt,
    createdAt: record.createdAt,
  };
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^\s*(re|fw|fwd)\s*:\s*/i, '')
    .trim()
    .toLowerCase();
}
