import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  CreateEmailThreadParams,
  EmailThreadRepository,
} from '../../application/ports/email-thread.repository.js';
import { EmailThread } from '../../domain/entities/email-thread.entity.js';

export class PrismaEmailThreadRepository implements EmailThreadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByThreadKey(mailboxAccountId: string, threadKey: string): Promise<EmailThread | null> {
    const record = await this.prisma.emailThread.findUnique({
      where: {
        mailboxAccountId_threadKey: {
          mailboxAccountId,
          threadKey,
        },
      },
    });
    return record ? toDomain(record) : null;
  }

  async create(params: CreateEmailThreadParams): Promise<EmailThread> {
    const record = await this.prisma.emailThread.create({
      data: {
        id: params.id,
        mailboxAccountId: params.mailboxAccountId,
        threadKey: params.threadKey,
        externalThreadId: params.externalThreadId ?? null,
        subjectNormalized: params.subjectNormalized ?? null,
        customerEmail: params.customerEmail ?? null,
        latestMessageAt: params.latestMessageAt ?? null,
      },
    });
    return toDomain(record);
  }
}

function toDomain(record: {
  id: string;
  mailboxAccountId: string;
  threadKey: string;
  externalThreadId: string | null;
  subjectNormalized: string | null;
  customerEmail: string | null;
  latestMessageAt: Date | null;
}): EmailThread {
  return {
    id: record.id,
    mailboxAccountId: record.mailboxAccountId,
    threadKey: record.threadKey,
    externalThreadId: record.externalThreadId ?? undefined,
    subjectNormalized: record.subjectNormalized ?? undefined,
    customerEmail: record.customerEmail ?? undefined,
    latestMessageAt: record.latestMessageAt ?? undefined,
  };
}
