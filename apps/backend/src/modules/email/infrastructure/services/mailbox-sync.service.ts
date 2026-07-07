import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../common/database/prisma.service.js';

export interface MailboxSyncState {
  mailboxAccountId: string;
  mailboxName: string;
  uidValidity: bigint | null;
  lastSeenUid: bigint | null;
  lastProcessedUid: bigint | null;
  bootstrapCompletedAt: Date | null;
}

@Injectable()
export class MailboxSyncService {
  constructor(private readonly prisma: PrismaService) {}

  /** 查找或创建 MailboxAccount，返回其 ID */
  async resolveMailboxAccountId(imapUser: string, imapHost: string): Promise<string> {
    const existing = await this.prisma.mailboxAccount.findFirst({
      where: { emailAddress: imapUser, imapHost },
    });
    if (existing) return existing.id;

    const created = await this.prisma.mailboxAccount.create({
      data: {
        emailAddress: imapUser,
        provider: 'imap',
        imapHost,
        imapPort: Number(process.env.IMAP_PORT || 993),
        imapSecure: process.env.IMAP_SECURE !== 'false',
        status: 'active',
      },
    });
    return created.id;
  }

  /** 获取同步进度 */
  async getSyncState(mailboxAccountId: string, mailboxName: string): Promise<MailboxSyncState | null> {
    const record = await this.prisma.mailboxSyncState.findUnique({
      where: {
        mailboxAccountId_mailboxName: {
          mailboxAccountId,
          mailboxName,
        },
      },
    });
    return record as MailboxSyncState | null;
  }

  /** 更新 lastSeenUid */
  async updateLastSeenUid(
    mailboxAccountId: string,
    mailboxName: string,
    uid: bigint,
    uidValidity: bigint | null,
  ): Promise<void> {
    await this.prisma.mailboxSyncState.upsert({
      where: {
        mailboxAccountId_mailboxName: {
          mailboxAccountId,
          mailboxName,
        },
      },
      create: {
        mailboxAccountId,
        mailboxName,
        uidValidity,
        lastSeenUid: uid,
      },
      update: {
        uidValidity: uidValidity ?? undefined,
        lastSeenUid: uid,
      },
    });
  }

  /** 更新 lastProcessedUid */
  async updateLastProcessedUid(
    mailboxAccountId: string,
    mailboxName: string,
    uid: bigint,
  ): Promise<void> {
    await this.prisma.mailboxSyncState.upsert({
      where: {
        mailboxAccountId_mailboxName: {
          mailboxAccountId,
          mailboxName,
        },
      },
      create: {
        mailboxAccountId,
        mailboxName,
        lastProcessedUid: uid,
      },
      update: {
        lastProcessedUid: uid,
      },
    });
  }

  /** 标记 bootstrap 完成 */
  async markBootstrapCompleted(mailboxAccountId: string, mailboxName: string): Promise<void> {
    await this.prisma.mailboxSyncState.upsert({
      where: {
        mailboxAccountId_mailboxName: {
          mailboxAccountId,
          mailboxName,
        },
      },
      create: {
        mailboxAccountId,
        mailboxName,
        bootstrapCompletedAt: new Date(),
      },
      update: {
        bootstrapCompletedAt: new Date(),
      },
    });
  }
}
