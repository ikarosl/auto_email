import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emailAiAnalysisSchema } from './email-ai-analysis.schema.js';

describe('emailAiAnalysisSchema', () => {
  it('accepts a unified email workflow analysis', () => {
    const result = emailAiAnalysisSchema.safeParse(createAnalysis());
    assert.equal(result.success, true);
  });

  it('coerces numeric extracted requirement values to strings', () => {
    const result = emailAiAnalysisSchema.safeParse(createAnalysis({
      extractedRequirements: { productType: 'isolator', power: 20, quantity: 50, application: 123 },
    }));
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.extractedRequirements.power, '20');
      assert.equal(result.data.extractedRequirements.quantity, '50');
      assert.equal(result.data.extractedRequirements.application, '123');
    }
  });

  it('rejects a terminal lifecycle state with a non-none owner', () => {
    const result = emailAiAnalysisSchema.safeParse(createAnalysis({
      suggestedState: { businessStage: 'commercial', actionOwner: 'us', lifecycleStatus: 'lost' },
    }));
    assert.equal(result.success, false);
  });

  it('rejects an unknown business event', () => {
    const result = emailAiAnalysisSchema.safeParse(createAnalysis({
      events: [{
        eventType: 'invented_event',
        actor: 'customer',
        confidence: 0.9,
        evidence: 'Evidence',
        payload: {},
      }],
    }));
    assert.equal(result.success, false);
  });
});

function createAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    messageClassification: 'customer_inquiry',
    events: [{
      eventType: 'requirements_provided',
      actor: 'customer',
      confidence: 0.92,
      evidence: 'Customer supplied frequency and quantity.',
      payload: {},
    }],
    suggestedState: {
      businessStage: 'technical_review',
      actionOwner: 'us',
      lifecycleStatus: 'active',
    },
    confidence: 0.92,
    riskLevel: 'low',
    reason: 'Technical requirements are ready for review.',
    missingFields: [],
    extractedRequirements: { productType: 'circulator', frequencyRange: '12-15GHz' },
    quoteBoundaryDetected: false,
    humanReviewRequired: true,
    nextAction: 'Review the requirements.',
    ...overrides,
  };
}
