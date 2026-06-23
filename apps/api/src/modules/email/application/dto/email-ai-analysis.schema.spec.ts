import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { emailAiAnalysisSchema } from './email-ai-analysis.schema.js';

describe('emailAiAnalysisSchema', () => {
  it('accepts a valid AI analysis result', () => {
    const result = emailAiAnalysisSchema.safeParse({
      isInquiry: true,
      classification: 'valid_inquiry',
      suggestedStatus: InquiryStatus.NEED_CLARIFICATION,
      confidence: 0.82,
      riskLevel: 'medium',
      reason: 'Customer provided frequency and quantity but missed power and VSWR.',
      missingFields: ['power', 'vswr'],
      extractedRequirements: {
        productType: 'circulator',
        frequencyRange: '12-15GHz',
        quantity: '10 pcs',
      },
      quoteBoundaryDetected: false,
      humanReviewRequired: true,
      nextAction: 'Ask customer for missing technical parameters.',
    });

    assert.equal(result.success, true);
  });

  it('rejects quote boundary output without human review', () => {
    const result = emailAiAnalysisSchema.safeParse({
      isInquiry: true,
      classification: 'commercial',
      suggestedStatus: InquiryStatus.NEED_ENGINEER_REVIEW,
      confidence: 0.91,
      riskLevel: 'high',
      reason: 'Customer asked for price and lead time.',
      missingFields: [],
      extractedRequirements: {},
      quoteBoundaryDetected: true,
      humanReviewRequired: false,
      nextAction: 'Manual review required.',
    });

    assert.equal(result.success, false);
  });

  it('rejects ready_for_quote output without human review', () => {
    const result = emailAiAnalysisSchema.safeParse({
      isInquiry: true,
      classification: 'valid_inquiry',
      suggestedStatus: InquiryStatus.READY_FOR_QUOTE,
      confidence: 0.7,
      riskLevel: 'medium',
      reason: 'Customer provided enough details.',
      missingFields: [],
      extractedRequirements: {},
      quoteBoundaryDetected: false,
      humanReviewRequired: false,
      nextAction: 'Prepare quotation handoff.',
    });

    assert.equal(result.success, false);
  });
});
