import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CreateInquiryFromEmailUseCase } from '../../../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { InMemoryInquiryRepository } from '../../../inquiry/infrastructure/repositories/in-memory-inquiry.repository.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { InMemoryEmailMessageRepository } from '../../infrastructure/repositories/in-memory-email-message.repository.js';
import { ReceiveInboundEmailUseCase } from './receive-inbound-email.use-case.js';

describe('ReceiveInboundEmailUseCase', () => {
  it('stores inbound email and creates a new inquiry case', async () => {
    const emailRepository = new InMemoryEmailMessageRepository();
    const inquiryRepository = new InMemoryInquiryRepository();
    const createInquiryFromEmailUseCase = new CreateInquiryFromEmailUseCase(inquiryRepository);
    const receiveInboundEmailUseCase = new ReceiveInboundEmailUseCase(
      emailRepository,
      createInquiryFromEmailUseCase,
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
    });

    assert.equal(result.emailMessage.externalMessageId, 'mock-message-001');
    assert.equal(result.inquiryCase.sourceEmailMessageId, result.emailMessage.id);
    assert.equal(result.inquiryCase.customerEmail, 'buyer@example.com');
    assert.equal(result.inquiryCase.status, InquiryStatus.NEW);
    assert.equal((await emailRepository.list()).length, 1);
    assert.equal((await inquiryRepository.list()).length, 1);
  });
});
