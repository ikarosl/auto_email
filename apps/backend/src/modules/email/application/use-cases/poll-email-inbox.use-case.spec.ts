import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { INITIAL_INQUIRY_STATE } from '../../../inquiry/domain/enums/inquiry-state.enum.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { InMemoryProcessedEmailTracker } from '../../infrastructure/repositories/in-memory-processed-email-tracker.js';
import { PollEmailInboxUseCase } from './poll-email-inbox.use-case.js';
import { ProcessInquiryEmailEventUseCase } from './process-inquiry-email-event.use-case.js';
import { ReceiveInboundEmailUseCase } from './receive-inbound-email.use-case.js';

describe('PollEmailInboxUseCase', () => {
  it('stores and processes an unhandled email once', async () => {
    const tracker = new InMemoryProcessedEmailTracker();
    let processCalls = 0;
    const useCase = new PollEmailInboxUseCase(
      tracker,
      { execute: async () => createReceiveResult() } as unknown as ReceiveInboundEmailUseCase,
      {
        execute: async () => {
          processCalls += 1;
          return { kind: 'email_analysis', analysisDecisionId: 'analysis_1', stateDecisionId: 'state_1' };
        },
      } as unknown as ProcessInquiryEmailEventUseCase,
    );
    const candidate = createCandidate();

    const first = await useCase.processCandidate(candidate);
    const second = await useCase.processCandidate(candidate);

    assert.equal(first.skipped, false);
    assert.equal(first.analysisDecisionId, 'analysis_1');
    assert.equal(first.stateDecisionId, 'state_1');
    assert.equal(second.skipped, true);
    assert.equal(processCalls, 1);
  });
});

function createCandidate() {
  return {
    identity: { mailbox: 'INBOX', messageId: 'message_1' },
    inboundEmail: {
      messageId: 'message_1',
      mailboxAccountId: 'mailbox_1',
      fromEmail: 'buyer@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'RF inquiry',
      bodyText: 'Need an isolator.',
      receivedAt: new Date('2026-07-15T00:00:00.000Z'),
      source: EmailSource.MOCK,
    },
  };
}

function createReceiveResult() {
  const now = new Date('2026-07-15T00:00:00.000Z');
  return {
    emailMessage: {
      id: 'email_1',
      externalMessageId: 'message_1',
      direction: EmailDirection.INBOUND,
      source: EmailSource.MOCK,
      fromEmail: 'buyer@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'RF inquiry',
      bodyText: 'Need an isolator.',
      receivedAt: now,
      createdAt: now,
    },
    inquiryCase: {
      id: 'inquiry_1',
      customerEmail: 'buyer@example.com',
      subject: 'RF inquiry',
      ...INITIAL_INQUIRY_STATE,
      latestMessageAt: now,
      createdAt: now,
      updatedAt: now,
    },
    recoveredEmails: [],
  };
}
