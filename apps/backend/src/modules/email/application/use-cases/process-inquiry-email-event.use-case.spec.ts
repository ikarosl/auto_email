import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { ProcessInquiryEmailEventUseCase } from './process-inquiry-email-event.use-case.js';

describe('ProcessInquiryEmailEventUseCase', () => {
  it('uses the state at the email time and excludes the current business subject for historical backfill', async () => {
    let capturedInquiry: InquiryCase | undefined;
    let savedStateDecision: Record<string, unknown> | undefined;
    const prisma = {
      emailAnalysisDecision: {
        findUnique: async () => null,
      },
      inquiryStateTransition: {
        findFirst: async () => ({
          toBusinessStage: 'technical_review',
          toActionOwner: 'customer',
          toLifecycleStatus: 'active',
          stateDecision: { beforeStateVersion: 1 },
        }),
      },
      inquiryStateDecision: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          savedStateDecision = data;
          return data;
        },
      },
      $transaction: async (callback: (tx: unknown) => Promise<void>) => callback({
        emailAnalysisDecision: { create: async () => ({}) },
        inquiryBusinessEvent: { create: async () => ({}) },
      }),
    };
    const analyzer = {
      execute: async (_email: EmailMessage, context: { inquiryCase: InquiryCase }) => {
        capturedInquiry = context.inquiryCase;
        return {
          success: true,
          analysis: {
            messageClassification: 'customer_follow_up',
            events: [{
              eventType: 'customer_response_received',
              actor: 'customer',
              confidence: 0.96,
              evidence: 'Historical customer response.',
              payload: {},
            }],
            suggestedState: {
              businessStage: 'commercial',
              actionOwner: 'us',
              lifecycleStatus: 'active',
            },
            confidence: 0.96,
            riskLevel: 'low',
            reason: 'Historical response advances the inquiry.',
            missingFields: [],
            extractedRequirements: {},
            quoteBoundaryDetected: false,
            humanReviewRequired: false,
            nextAction: 'Review historical decision.',
          },
          rawOutput: '{}',
          contextSnapshotId: 'snapshot_historical',
        };
      },
    };
    const useCase = new ProcessInquiryEmailEventUseCase(
      prisma as any,
      analyzer as any,
      { applyAutomatic: async () => assert.fail('Historical backfill must not auto-apply.') } as any,
      { listByInquiryCaseId: async () => [] } as any,
      { findById: async () => undefined } as any,
      { execute: async () => assert.fail('Historical backfill must not update the customer.') } as any,
      { execute: async () => assert.fail('Historical backfill must not update facts.') } as any,
      { execute: async () => assert.fail('Historical backfill must not update the subject.') } as any,
      { execute: async () => assert.fail('Historical backfill must not generate a draft.') } as any,
    );
    const inquiry = createInquiry();

    const result = await useCase.execute({
      emailMessage: createEmail(),
      inquiryCase: inquiry,
      historicalBackfill: true,
    });

    assert.equal(capturedInquiry?.businessStage, 'technical_review');
    assert.equal(capturedInquiry?.actionOwner, 'customer');
    assert.equal(capturedInquiry?.stateVersion, 2);
    assert.equal(capturedInquiry?.businessSubject, undefined);
    assert.equal(capturedInquiry?.latestMessageAt.toISOString(), '2026-07-01T08:00:00.000Z');
    assert.equal(savedStateDecision?.beforeBusinessStage, 'technical_review');
    assert.equal(savedStateDecision?.beforeActionOwner, 'customer');
    assert.equal(savedStateDecision?.beforeStateVersion, 2);
    assert.equal(savedStateDecision?.executionStatus, 'historical_backfill');
    assert.equal(result.stateExecutionStatus, 'historical_backfill');
    assert.equal(inquiry.businessStage, 'commercial');
    assert.equal(inquiry.stateVersion, 7);
  });
});

function createInquiry(): InquiryCase {
  return {
    id: 'inquiry_current',
    customerEmail: 'customer@example.com',
    subject: 'Original inquiry',
    businessSubject: 'Future generated subject',
    businessSubjectSource: 'ai_generated',
    businessStage: 'commercial',
    actionOwner: 'customer',
    lifecycleStatus: 'active',
    stateVersion: 7,
    latestMessageAt: new Date('2026-07-10T08:00:00.000Z'),
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    updatedAt: new Date('2026-07-10T08:00:00.000Z'),
  };
}

function createEmail(): EmailMessage {
  return {
    id: 'email_historical',
    externalMessageId: '<historical@example.com>',
    direction: EmailDirection.INBOUND,
    source: EmailSource.MANUAL,
    fromEmail: 'customer@example.com',
    toEmails: ['sales@example.test'],
    ccEmails: [],
    subject: 'Historical response',
    bodyText: 'This message belongs earlier in the inquiry timeline.',
    receivedAt: new Date('2026-07-01T08:00:00.000Z'),
    createdAt: new Date('2026-07-15T08:00:00.000Z'),
  };
}
