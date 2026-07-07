import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CreateInquiryFromEmailUseCase } from '../../../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { FindInquiryForInboundEmailUseCase } from '../../../inquiry/application/use-cases/find-inquiry-for-inbound-email.use-case.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { InMemoryInquiryMessageRepository } from '../../../inquiry/infrastructure/repositories/in-memory-inquiry-message.repository.js';
import { InMemoryInquiryRepository } from '../../../inquiry/infrastructure/repositories/in-memory-inquiry.repository.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { InMemoryEmailMessageRepository } from '../../infrastructure/repositories/in-memory-email-message.repository.js';
import { ReceiveInboundEmailUseCase } from './receive-inbound-email.use-case.js';

describe('ReceiveInboundEmailUseCase', () => {
  it('stores inbound email and creates a new inquiry case', async () => {
    const emailRepository = new InMemoryEmailMessageRepository();
    const inquiryRepository = new InMemoryInquiryRepository();
    const createInquiryFromEmailUseCase = new CreateInquiryFromEmailUseCase(inquiryRepository);
    const emailThreadRepository = createMockEmailThreadRepository();
    const receiveInboundEmailUseCase = new ReceiveInboundEmailUseCase(
      emailRepository,
      createInquiryFromEmailUseCase,
      emailThreadRepository,
    );

    const result = await receiveInboundEmailUseCase.execute({
      messageId: 'mock-message-001',
      threadId: 'mock-thread-001',
      fromEmail: 'buyer@example.com',
      fromName: 'John Smith',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'Inquiry for 12-15GHz microstrip circulator',
      bodyText: 'We need a 12-15GHz microstrip circulator, small size, 10 pcs.',
      receivedAt: new Date('2026-06-22T10:00:00.000Z'),
      source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
    });

    assert.equal(result.emailMessage.externalMessageId, 'mock-message-001');
    const inquiryCase = expectInquiryCase(result);
    assert.equal(inquiryCase.sourceEmailMessageId, result.emailMessage.id);
    assert.equal(inquiryCase.customerEmail, 'buyer@example.com');
    assert.equal(inquiryCase.status, InquiryStatus.NEW);
    assert.equal((await emailRepository.list()).length, 1);
    assert.equal((await inquiryRepository.list()).length, 1);
  });

  it('cleans inbound email content before storing it', async () => {
    const emailRepository = new InMemoryEmailMessageRepository();
    const inquiryRepository = new InMemoryInquiryRepository();
    const receiveInboundEmailUseCase = new ReceiveInboundEmailUseCase(
      emailRepository,
      new CreateInquiryFromEmailUseCase(inquiryRepository),
      createMockEmailThreadRepository(),
    );

    const result = await receiveInboundEmailUseCase.execute({
      messageId: 'mock-message-html',
      fromEmail: 'buyer@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'Parameter supplement',
      bodyHtml: [
        '<p>Frequency: 12-15GHz</p>',
        '<p>Quantity: 50 pcs</p>',
        '<div>On Tue, Jun 23, 2026 at 10:00 AM Sales wrote:</div>',
        '<blockquote>Which frequency range do you need?</blockquote>',
      ].join(''),
      receivedAt: new Date('2026-06-22T10:00:00.000Z'),
      source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
    });

    assert.equal(result.emailMessage.bodyText, 'Frequency: 12-15GHz\nQuantity: 50 pcs');
    assert.ok(result.emailMessage.bodyHtml?.includes('<blockquote>'));
  });

  it('merges an inbound email into an inquiry matched by threadId', async () => {
    const { receiveInboundEmailUseCase, inquiryRepository, inquiryMessageRepository } = createUseCaseWithMatcher();

    const first = await receiveInboundEmailUseCase.execute({
      messageId: 'mock-message-001',
      threadId: 'thread-001',
      fromEmail: 'buyer@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'need rf circulator',
      bodyText: 'We need an RF circulator.',
      receivedAt: new Date('2026-06-22T10:00:00.000Z'),
      source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
    });

    const second = await receiveInboundEmailUseCase.execute({
      messageId: 'mock-message-002',
      threadId: 'thread-001',
      fromEmail: 'buyer@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'supplement product params',
      bodyText: '12-15GHz, 20W CW, 50 pcs.',
      receivedAt: new Date('2026-06-22T11:00:00.000Z'),
      source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
    });

    assert.equal(expectInquiryCase(second).id, expectInquiryCase(first).id);
    assert.equal((await inquiryRepository.list()).length, 1);
    assert.equal((await inquiryMessageRepository.list()).length, 2);
  });

  it('merges into the only recent open inquiry from the same customer', async () => {
    const { receiveInboundEmailUseCase, inquiryRepository } = createUseCaseWithMatcher();

    const first = await receiveInboundEmailUseCase.execute({
      messageId: 'mock-message-001',
      threadId: 'thread-001',
      fromEmail: 'buyer@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'need rf circulator',
      bodyText: 'We need an RF circulator.',
      receivedAt: new Date(),
      source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
    });

    const second = await receiveInboundEmailUseCase.execute({
      messageId: 'mock-message-002',
      threadId: 'thread-002',
      fromEmail: 'buyer@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'supplement product params',
      bodyText: '12-15GHz, 20W CW, 50 pcs.',
      receivedAt: new Date(),
      source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
    });

    assert.equal(expectInquiryCase(second).id, expectInquiryCase(first).id);
    assert.equal((await inquiryRepository.list()).length, 1);
  });

  it('does not auto-merge when the same customer has multiple open inquiries', async () => {
    const { receiveInboundEmailUseCase, inquiryRepository } = createUseCaseWithMatcher();
    const now = new Date();

    await inquiryRepository.save({
      id: 'inquiry_001',
      customerEmail: 'buyer@example.com',
      subject: 'First open inquiry',
      status: InquiryStatus.NEW,
      latestMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await inquiryRepository.save({
      id: 'inquiry_002',
      customerEmail: 'buyer@example.com',
      subject: 'Second open inquiry',
      status: InquiryStatus.NEED_CLARIFICATION,
      latestMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const result = await receiveInboundEmailUseCase.execute({
      messageId: 'mock-message-003',
      threadId: 'thread-003',
      fromEmail: 'buyer@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'new possible inquiry',
      bodyText: 'Please check this new request.',
      receivedAt: now,
      source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
    });

    const inquiryCase = expectInquiryCase(result);
    assert.notEqual(inquiryCase.id, 'inquiry_001');
    assert.notEqual(inquiryCase.id, 'inquiry_002');
    assert.equal((await inquiryRepository.list()).length, 3);
  });

  it('creates a new inquiry when no matching rule is hit', async () => {
    const { receiveInboundEmailUseCase, inquiryRepository } = createUseCaseWithMatcher();

    await receiveInboundEmailUseCase.execute({
      messageId: 'mock-message-001',
      threadId: 'thread-001',
      fromEmail: 'first@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'first inquiry',
      bodyText: 'We need an RF circulator.',
      receivedAt: new Date(),
      source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
    });

    const second = await receiveInboundEmailUseCase.execute({
      messageId: 'mock-message-002',
      threadId: 'thread-002',
      fromEmail: 'second@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'second inquiry',
      bodyText: 'We need an RF isolator.',
      receivedAt: new Date(),
      source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
    });

    assert.equal(expectInquiryCase(second).customerEmail, 'second@example.com');
    assert.equal((await inquiryRepository.list()).length, 2);
  });

  it('stores own copied email without creating a new inquiry when no match is found', async () => {
    const previousImapUser = process.env.IMAP_USER;
    const previousAiMailbox = process.env.AI_MAILBOX;
    process.env.IMAP_USER = 'silent@hzbeat.com';
    process.env.AI_MAILBOX = 'silent@hzbeat.com';

    try {
      const { receiveInboundEmailUseCase, inquiryRepository } = createUseCaseWithMatcher();

      const result = await receiveInboundEmailUseCase.execute({
        messageId: 'own-message-001',
        fromEmail: 'shira@hzbeat.com',
        toEmails: ['buyer@example.com'],
        ccEmails: ['silent@hzbeat.com'],
        subject: 'Re: RF inquiry',
        bodyText: 'We will check and reply tomorrow.',
        receivedAt: new Date(),
        source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
      });

      assert.equal(result.emailMessage.direction, 'outbound');
      assert.equal(result.inquiryCase, undefined);
      assert.equal(result.skippedReason, 'own_email_without_matching_inquiry');
      assert.equal((await inquiryRepository.list()).length, 0);
    } finally {
      restoreEnv('IMAP_USER', previousImapUser);
      restoreEnv('AI_MAILBOX', previousAiMailbox);
    }
  });

  it('stores public mailbox sent email as outbound even without ai mailbox copied', async () => {
    const previousImapUser = process.env.IMAP_USER;
    process.env.IMAP_USER = 'silent@hzbeat.com';

    try {
      const { receiveInboundEmailUseCase, inquiryRepository } = createUseCaseWithMatcher();

      const result = await receiveInboundEmailUseCase.execute({
        messageId: 'own-message-002',
        fromEmail: 'silent@hzbeat.com',
        toEmails: ['buyer@example.com'],
        ccEmails: [],
        subject: 'Re: RF inquiry',
        bodyText: 'Please see the attached contract.',
        receivedAt: new Date(),
        source: EmailSource.MOCK,
      mailboxAccountId: 'mock-account',
      });

      assert.equal(result.emailMessage.direction, 'outbound');
      assert.equal(result.inquiryCase, undefined);
      assert.equal(result.skippedReason, 'own_email_without_matching_inquiry');
      assert.equal((await inquiryRepository.list()).length, 0);
    } finally {
      restoreEnv('IMAP_USER', previousImapUser);
    }
  });
});

function expectInquiryCase(
  result: Awaited<ReturnType<ReceiveInboundEmailUseCase['execute']>>,
) {
  assert.ok(result.inquiryCase);
  return result.inquiryCase;
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function createMockEmailThreadRepository() {
  let counter = 0;
  return {
    findByThreadKey: async () => null,
    create: async (params: { id: string; threadKey: string; mailboxAccountId: string }) => ({
      ...params,
      externalThreadId: undefined,
      subjectNormalized: undefined,
      customerEmail: undefined,
      latestMessageAt: undefined,
    }),
  } as const;
}

function createUseCaseWithMatcher() {
  const emailRepository = new InMemoryEmailMessageRepository();
  const inquiryRepository = new InMemoryInquiryRepository();
  const inquiryMessageRepository = new InMemoryInquiryMessageRepository();
  const emailThreadRepository = createMockEmailThreadRepository();
  const createInquiryFromEmailUseCase = new CreateInquiryFromEmailUseCase(inquiryRepository);
  const findInquiryForInboundEmailUseCase = new FindInquiryForInboundEmailUseCase(
    inquiryRepository,
    inquiryMessageRepository,
    emailRepository,
  );
  const receiveInboundEmailUseCase = new ReceiveInboundEmailUseCase(
    emailRepository,
    createInquiryFromEmailUseCase,
    emailThreadRepository,
    findInquiryForInboundEmailUseCase,
    inquiryMessageRepository,
  );

  return {
    emailRepository,
    inquiryRepository,
    inquiryMessageRepository,
    receiveInboundEmailUseCase,
  };
}
