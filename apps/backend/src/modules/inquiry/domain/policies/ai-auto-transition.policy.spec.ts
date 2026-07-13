import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EmailAiAnalysis } from '../../../email/domain/value-objects/email-ai-analysis.vo.js';
import { InquiryStatus } from '../enums/inquiry-status.enum.js';
import { evaluateAiAutoTransition } from './ai-auto-transition.policy.js';

describe('evaluateAiAutoTransition', () => {
  it('allows a high-confidence valid inquiry to enter engineer review', () => {
    const result = evaluateAiAutoTransition(
      InquiryStatus.NEW,
      createAnalysis({ suggestedStatus: InquiryStatus.NEED_ENGINEER_REVIEW }),
      { enabled: true, dryRun: false, minimumConfidence: 0.85 },
    );

    assert.equal(result.allowed, true);
  });

  it('rejects quotation-boundary and terminal transitions', () => {
    const clarification = evaluateAiAutoTransition(
      InquiryStatus.NEW,
      createAnalysis({
        suggestedStatus: InquiryStatus.NEED_CLARIFICATION,
        missingFields: ['frequencyRange'],
        quoteBoundaryDetected: true,
      }),
      { enabled: true, dryRun: false, minimumConfidence: 0.85 },
    );
    const readyForQuote = evaluateAiAutoTransition(
      InquiryStatus.NEED_ENGINEER_REVIEW,
      createAnalysis({ suggestedStatus: InquiryStatus.READY_FOR_QUOTE }),
      { enabled: true, dryRun: false, minimumConfidence: 0.85 },
    );

    assert.equal(clarification.allowed, false);
    assert.equal(readyForQuote.allowed, false);
  });

  it('applies the stricter global confidence threshold', () => {
    const result = evaluateAiAutoTransition(
      InquiryStatus.NEW,
      createAnalysis({ confidence: 0.91, suggestedStatus: InquiryStatus.NEED_ENGINEER_REVIEW }),
      { enabled: true, dryRun: false, minimumConfidence: 0.95 },
    );

    assert.equal(result.allowed, false);
  });

  it('rejects every transition while the feature is disabled', () => {
    const result = evaluateAiAutoTransition(
      InquiryStatus.NEW,
      createAnalysis({ suggestedStatus: InquiryStatus.INVALID, classification: 'invalid' }),
      { enabled: false, dryRun: true, minimumConfidence: 0.9 },
    );

    assert.equal(result.allowed, false);
  });
});

function createAnalysis(overrides: Partial<EmailAiAnalysis>): EmailAiAnalysis {
  return {
    isInquiry: true,
    classification: 'valid_inquiry',
    suggestedStatus: InquiryStatus.NEED_ENGINEER_REVIEW,
    confidence: 0.95,
    riskLevel: 'low',
    reason: 'Test analysis.',
    missingFields: [],
    extractedRequirements: {},
    quoteBoundaryDetected: false,
    humanReviewRequired: true,
    nextAction: 'Review.',
    ...overrides,
  };
}
