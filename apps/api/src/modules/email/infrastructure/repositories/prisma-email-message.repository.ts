import { PrismaService } from '../../../../common/database/prisma.service.js';
import { EmailMessageRepository } from '../../application/ports/email-message.repository.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';

export class PrismaEmailMessageRepository implements EmailMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(emailMessage: EmailMessage): Promise<EmailMessage> {
    const data = {
      id: emailMessage.id,
      messageId: emailMessage.externalMessageId,
      emailThreadId: emailMessage.threadId ?? null,
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

    return emailMessage;
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
    threadId: record.emailThreadId ?? undefined,
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
