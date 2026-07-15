import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import type { OutboundEmailEventAnalysis } from '../dto/outbound-email-event-analysis.schema.js';
import { evaluateOutboundEmailEvent } from './outbound-email-event.policy.js';

const responseRequest: OutboundEmailEventAnalysis = {
  eventType: 'commercial_terms_sent',
  responseExpected: true,
  suggestedStatus: InquiryStatus.WAITING_CUSTOMER,
  confidence: 0.96,
  riskLevel: 'low',
  commercialBoundaryDetected: true,
  humanReviewRequired: true,
  reason: 'Customer confirmation is required.',
};

describe('evaluateOutboundEmailEvent', () => {
  it('allows a safe waiting-customer event when automatic execution is enabled', () => {
    const result = evaluateOutboundEmailEvent(
      InquiryStatus.NEED_ENGINEER_REVIEW,
      responseRequest,
      enabledEnv(false),
    );
    assert.equal(result.executionStatus, 'eligible');
    assert.equal(result.toStatus, InquiryStatus.WAITING_CUSTOMER);
  });

  it('uses the existing dry-run setting', () => {
    const result = evaluateOutboundEmailEvent(
      InquiryStatus.NEED_CLARIFICATION,
      responseRequest,
      enabledEnv(true),
    );
    assert.equal(result.executionStatus, 'dry_run');
  });

  it('leaves transition-table validation to the state machine', () => {
    const result = evaluateOutboundEmailEvent(InquiryStatus.NEW, responseRequest, enabledEnv(false));
    assert.equal(result.executionStatus, 'eligible');
  });

  it('allows a formal quotation event without a separate confirmation step', () => {
    const result = evaluateOutboundEmailEvent(
      InquiryStatus.READY_FOR_QUOTE,
      {
        ...responseRequest,
        eventType: 'formal_quote_sent',
        suggestedStatus: InquiryStatus.QUOTED,
      },
      enabledEnv(false),
    );
    assert.equal(result.executionStatus, 'eligible');
    assert.equal(result.toStatus, InquiryStatus.QUOTED);
  });

  it('does not change status for messages that expect no response', () => {
    const result = evaluateOutboundEmailEvent(
      InquiryStatus.NEED_ENGINEER_REVIEW,
      { ...responseRequest, responseExpected: false, suggestedStatus: null },
      enabledEnv(false),
    );
    assert.equal(result.executionStatus, 'no_change');
  });

  it('keeps waiting_customer pending when the email does not request a response', () => {
    const result = evaluateOutboundEmailEvent(
      InquiryStatus.NEED_CLARIFICATION,
      { ...responseRequest, responseExpected: false },
      enabledEnv(false),
    );
    assert.equal(result.executionStatus, 'pending');
  });

  it('rejects high-risk events instead of applying them automatically', () => {
    const result = evaluateOutboundEmailEvent(
      InquiryStatus.READY_FOR_QUOTE,
      {
        ...responseRequest,
        eventType: 'formal_quote_sent',
        suggestedStatus: InquiryStatus.QUOTED,
        riskLevel: 'high',
      },
      enabledEnv(false),
    );
    assert.equal(result.executionStatus, 'rejected');
  });
});

function enabledEnv(dryRun: boolean): NodeJS.ProcessEnv {
  return {
    AI_STATUS_TRANSITION_ENABLED: 'true',
    AI_STATUS_TRANSITION_DRY_RUN: String(dryRun),
    AI_STATUS_TRANSITION_MIN_CONFIDENCE: '0.90',
  };
}
