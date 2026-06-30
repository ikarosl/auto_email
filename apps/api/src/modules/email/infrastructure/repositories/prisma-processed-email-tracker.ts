import { env } from 'node:process';

import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  ProcessedEmailIdentity,
  ProcessedEmailRecord,
  ProcessedEmailTracker,
} from '../../application/ports/processed-email-tracker.js';

export class PrismaProcessedEmailTracker implements ProcessedEmailTracker {
  constructor(private readonly prisma: PrismaService) {}

  async markSeen(identity: ProcessedEmailIdentity): Promise<void> {
    const mailboxAccountId = await this.resolveMailboxAccountId();
    const mailboxName = identity.mailbox;

    await this.prisma.processedEmail.upsert({
      where: {
        mailboxAccountId_mailboxName_uidValidity_uid: {
          mailboxAccountId,
          mailboxName,
          uidValidity: BigInt(0),
          uid: BigInt(identity.uid ?? 0),
        },
      },
      create: {
        mailboxAccountId,
        mailboxName,
        uidValidity: BigInt(0),
        uid: BigInt(identity.uid ?? 0),
        messageId: identity.messageId ?? null,
        seenAt: new Date(),
      },
      update: {
        messageId: identity.messageId ?? undefined,
      },
    });
  }

  async markProcessed(identity: ProcessedEmailIdentity): Promise<void> {
    const mailboxAccountId = await this.resolveMailboxAccountId();
    const mailboxName = identity.mailbox;

    await this.prisma.processedEmail.upsert({
      where: {
        mailboxAccountId_mailboxName_uidValidity_uid: {
          mailboxAccountId,
          mailboxName,
          uidValidity: BigInt(0),
          uid: BigInt(identity.uid ?? 0),
        },
      },
      create: {
        mailboxAccountId,
        mailboxName,
        uidValidity: BigInt(0),
        uid: BigInt(identity.uid ?? 0),
        messageId: identity.messageId ?? null,
        seenAt: new Date(),
        processedAt: new Date(),
      },
      update: {
        messageId: identity.messageId ?? undefined,
        processedAt: new Date(),
      },
    });
  }

  async hasSeen(identity: ProcessedEmailIdentity): Promise<boolean> {
    const record = await this.findRecord(identity);
    return record !== null;
  }

  async hasProcessed(identity: ProcessedEmailIdentity): Promise<boolean> {
    const record = await this.findRecord(identity);
    return record?.processedAt !== null && record?.processedAt !== undefined;
  }

  async list(): Promise<ProcessedEmailRecord[]> {
    const records = await this.prisma.processedEmail.findMany({
      orderBy: { seenAt: 'desc' },
    });

    return records.map((record) => ({
      mailbox: record.mailboxName,
      uid: Number(record.uid),
      messageId: record.messageId ?? undefined,
      seenAt: record.seenAt,
      processedAt: record.processedAt ?? undefined,
    }));
  }

  private async findRecord(identity: ProcessedEmailIdentity) {
    if (identity.uid === undefined) {
      return null;
    }

    const mailboxAccountId = await this.resolveMailboxAccountId();
    const mailboxName = identity.mailbox;

    try {
      return await this.prisma.processedEmail.findUnique({
        where: {
          mailboxAccountId_mailboxName_uidValidity_uid: {
            mailboxAccountId,
            mailboxName,
            uidValidity: BigInt(0),
            uid: BigInt(identity.uid),
          },
        },
      });
    } catch {
      return null;
    }
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

    // 当作 fallback: 用系统默认邮箱账号
    const system = await this.prisma.mailboxAccount.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'asc' },
    });

    if (system) return system.id;

    // 没有账号时自动创建一个占位邮箱账号
    const created = await this.prisma.mailboxAccount.create({
      data: {
        emailAddress: imapUser ?? 'system@local',
        provider: 'imap',
        imapHost: imapHost ?? 'localhost',
        imapPort: Number(env.IMAP_PORT || 993),
        imapSecure: env.IMAP_SECURE !== 'false',
        status: 'active',
      },
    });
    return created.id;
  }
}
