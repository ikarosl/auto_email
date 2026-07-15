import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { outboundEmailEventAnalysisSchema } from './outbound-email-event-analysis.schema.js';

describe('outboundEmailEventAnalysisSchema', () => {
  it('accepts a structured customer response request', () => {
    const result = outboundEmailEventAnalysisSchema.safeParse({
      eventType: 'commercial_terms_sent',
      responseExpected: true,
      suggestedStatus: 'waiting_customer',
      confidence: 0.96,
      riskLevel: 'low',
      commercialBoundaryDetected: true,
      humanReviewRequired: true,
      reason: 'Price was supplied and the customer was asked to confirm it.',
    });
    assert.equal(result.success, true);
  });

  it('rejects an unknown event type and invalid confidence', () => {
    const result = outboundEmailEventAnalysisSchema.safeParse({
      eventType: 'price_accepted',
      responseExpected: true,
      suggestedStatus: 'waiting_customer',
      confidence: 1.5,
      riskLevel: 'low',
      commercialBoundaryDetected: false,
      humanReviewRequired: true,
      reason: 'Invalid output.',
    });
    assert.equal(result.success, false);
  });
});
