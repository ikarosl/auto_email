import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { PrismaEmailMessageRepository } from './prisma-email-message.repository.js';

describe('PrismaEmailMessageRepository', () => {
  it('persists RFC reply headers with the email message', async () => {
    let createData: Record<string, unknown> | undefined;
    const prisma = {
      mailboxAccount: {
        findFirst: async () => ({ id: 'mailbox_1' }),
      },
      emailMessage: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          createData = create;
          return create;
        },
      },
    };
    const repository = new PrismaEmailMessageRepository(prisma as any);

    await repository.save({
      id: 'email_1',
      externalMessageId: '<child@example.com>',
      inReplyTo: '<parent@example.com>',
      references: ['<root@example.com>', '<parent@example.com>'],
      emailThreadId: 'thread_1',
      direction: EmailDirection.INBOUND,
      source: EmailSource.IMAP,
      fromEmail: 'buyer@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'Re: Inquiry',
      bodyText: 'Reply body',
      receivedAt: new Date('2026-07-15T08:00:00.000Z'),
      createdAt: new Date('2026-07-15T08:00:01.000Z'),
    });

    assert.equal(createData?.inReplyTo, '<parent@example.com>');
    assert.deepEqual(createData?.referencesJson, ['<root@example.com>', '<parent@example.com>']);
  });
});
