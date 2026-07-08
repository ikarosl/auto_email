import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { CustomerStatus } from '../../../inquiry/domain/enums/customer-status.enum.js';
import { InMemoryCustomerRepository } from '../../../inquiry/infrastructure/repositories/in-memory-customer.repository.js';
import { UpdateCustomerStatusFromAiAnalysisUseCase } from '../../../inquiry/application/use-cases/update-customer-status-from-ai-analysis.use-case.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import { EmailAiAnalysisAdapter } from '../ports/email-ai-analysis.adapter.js';
import { InMemoryProcessedEmailTracker } from '../../infrastructure/repositories/in-memory-processed-email-tracker.js';
import { InMemoryAiDecisionRepository } from '../../infrastructure/repositories/in-memory-ai-decision.repository.js';
import { InMemoryEmailMessageRepository } from '../../infrastructure/repositories/in-memory-email-message.repository.js';
import { InMemoryInquiryRepository } from '../../../inquiry/infrastructure/repositories/in-memory-inquiry.repository.js';
import { InMemoryInquiryMessageRepository } from '../../../inquiry/infrastructure/repositories/in-memory-inquiry-message.repository.js';
import { CreateInquiryFromEmailUseCase } from '../../../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { FindInquiryForInboundEmailUseCase } from '../../../inquiry/application/use-cases/find-inquiry-for-inbound-email.use-case.js';
import { ReceiveInboundEmailUseCase } from './receive-inbound-email.use-case.js';
import { AnalyzeEmailWithAiUseCase } from './analyze-email-with-ai.use-case.js';
import { PollEmailInboxUseCase } from './poll-email-inbox.use-case.js';

describe('PollEmailInboxUseCase customer status updates', () => {
  it('marks high-confidence invalid sender as invalid after AI analysis', async () => {
    const customerRepository = new InMemoryCustomerRepository();
    const aiDecisionRepository = new InMemoryAiDecisionRepository();
    const useCase = createPollUseCase(
      new StaticAiAdapter({
        classification: 'invalid',
        confidence: 0.95,
        reason: 'Unsolicited SEO service promotion, not a product inquiry.',
      }),
      customerRepository,
      aiDecisionRepository,
    );

    await useCase.processCandidate({
      identity: {
        mailbox: 'INBOX',
        messageId: 'message_ads',
      },
      inboundEmail: createInboundEmail({
        messageId: 'message_ads',
        fromEmail: 'ads@example.com',
        subject: 'SEO service',
        bodyText: 'We can improve your website ranking.',
      }),
    });

    const customer = await customerRepository.findByEmail('ads@example.com');
    const decisions = await aiDecisionRepository.list();
    assert.equal(customer?.status, CustomerStatus.INVALID);
    assert.equal(customer?.invalidReason, 'Unsolicited SEO service promotion, not a product inquiry.');
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0]?.emailMessageId.startsWith('email_'), true);
    assert.equal(decisions[0]?.inquiryCaseId.startsWith('inquiry_'), true);
    assert.ok(decisions[0] && !('success' in decisions[0].result));
    assert.equal(decisions[0].result.classification, 'invalid');
  });

  it('marks valid inquiry sender as active after AI analysis', async () => {
    const customerRepository = new InMemoryCustomerRepository();
    const aiDecisionRepository = new InMemoryAiDecisionRepository();
    const useCase = createPollUseCase(
      new StaticAiAdapter({
        classification: 'valid_inquiry',
        confidence: 0.8,
        reason: 'Customer asks for RF circulator price.',
      }),
      customerRepository,
      aiDecisionRepository,
    );

    await useCase.processCandidate({
      identity: {
        mailbox: 'INBOX',
        messageId: 'message_valid',
      },
      inboundEmail: createInboundEmail({
        messageId: 'message_valid',
        fromEmail: 'buyer@example.com',
        subject: 'RF circulator inquiry',
        bodyText: 'Please quote 50 RF circulators.',
      }),
    });

    const customer = await customerRepository.findByEmail('buyer@example.com');
    const decisions = await aiDecisionRepository.list();
    assert.equal(customer?.status, CustomerStatus.ACTIVE);
    assert.equal(customer?.invalidReason, undefined);
    assert.equal(decisions.length, 1);
    assert.ok(decisions[0] && !('success' in decisions[0].result));
    assert.equal(decisions[0].result.classification, 'valid_inquiry');
  });
});

class StaticAiAdapter implements EmailAiAnalysisAdapter {
  constructor(private readonly overrides: {
    classification: 'valid_inquiry' | 'invalid' | 'unknown';
    confidence: number;
    reason: string;
  }) {}

  async analyze(): Promise<string> {
    return JSON.stringify({
      isInquiry: this.overrides.classification === 'valid_inquiry',
      classification: this.overrides.classification,
      suggestedStatus: InquiryStatus.NEED_ENGINEER_REVIEW,
      confidence: this.overrides.confidence,
      riskLevel: 'low',
      reason: this.overrides.reason,
      missingFields: [],
      extractedRequirements: {},
      quoteBoundaryDetected: false,
      humanReviewRequired: true,
      nextAction: 'Review manually.',
    });
  }
}

function createPollUseCase(
  adapter: EmailAiAnalysisAdapter,
  customerRepository: InMemoryCustomerRepository,
  aiDecisionRepository: InMemoryAiDecisionRepository,
): PollEmailInboxUseCase {
  const processedEmailTracker = new InMemoryProcessedEmailTracker();
  const emailMessageRepository = new InMemoryEmailMessageRepository();
  const inquiryRepository = new InMemoryInquiryRepository();
  const inquiryMessageRepository = new InMemoryInquiryMessageRepository();
  const createInquiryFromEmailUseCase = new CreateInquiryFromEmailUseCase(inquiryRepository);
  const findInquiryForInboundEmailUseCase = new FindInquiryForInboundEmailUseCase(
    inquiryRepository,
    inquiryMessageRepository,
    emailMessageRepository,
  );
  const receiveInboundEmailUseCase = new ReceiveInboundEmailUseCase(
    emailMessageRepository,
    createInquiryFromEmailUseCase,
    createMockEmailThreadRepository(),
    findInquiryForInboundEmailUseCase,
    inquiryMessageRepository,
  );
  const analyzeEmailWithAiUseCase = new AnalyzeEmailWithAiUseCase(adapter);
  const updateCustomerStatusUseCase = new UpdateCustomerStatusFromAiAnalysisUseCase(customerRepository);

  return new PollEmailInboxUseCase(
    processedEmailTracker,
    receiveInboundEmailUseCase,
    analyzeEmailWithAiUseCase,
    inquiryMessageRepository,
    emailMessageRepository,
    updateCustomerStatusUseCase,
    aiDecisionRepository,
  );
}

function createInboundEmail(overrides: {
  messageId: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
}): InboundEmail {
  return {
    messageId: overrides.messageId,
    mailboxAccountId: 'mock-account',
    fromEmail: overrides.fromEmail,
    toEmails: ['sales@example.com'],
    ccEmails: [],
    subject: overrides.subject,
    bodyText: overrides.bodyText,
    receivedAt: new Date('2026-06-23T00:00:00.000Z'),
    source: EmailSource.MOCK,
  };
}

function createMockEmailThreadRepository() {
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
