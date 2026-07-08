import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InquiryStatus } from '../../domain/enums/inquiry-status.enum.js';
import { CustomerStatus } from '../../domain/enums/customer-status.enum.js';
import { InMemoryCustomerRepository } from '../../infrastructure/repositories/in-memory-customer.repository.js';
import { UpdateCustomerStatusFromAiAnalysisUseCase } from './update-customer-status-from-ai-analysis.use-case.js';

describe('UpdateCustomerStatusFromAiAnalysisUseCase', () => {
  it('marks a valid inquiry customer as active and clears invalid reason', async () => {
    const repository = new InMemoryCustomerRepository();
    const useCase = new UpdateCustomerStatusFromAiAnalysisUseCase(repository);

    const result = await useCase.execute({
      customerEmail: 'buyer@example.com',
      analysis: createAnalysis({
        classification: 'valid_inquiry',
        confidence: 0.72,
        reason: 'Customer asks for RF circulator quote.',
      }),
    });

    const customer = await repository.findByEmail('buyer@example.com');
    assert.equal(result.updated, true);
    assert.equal(result.status, CustomerStatus.ACTIVE);
    assert.equal(customer?.status, CustomerStatus.ACTIVE);
    assert.equal(customer?.invalidReason, undefined);
  });

  it('marks a high-confidence invalid customer as invalid using AI reason', async () => {
    const repository = new InMemoryCustomerRepository();
    const useCase = new UpdateCustomerStatusFromAiAnalysisUseCase(repository);

    const result = await useCase.execute({
      customerEmail: 'ads@example.com',
      analysis: createAnalysis({
        classification: 'invalid',
        confidence: 0.95,
        reason: 'Unsolicited SEO service promotion, not a product inquiry.',
      }),
    });

    const customer = await repository.findByEmail('ads@example.com');
    assert.equal(result.updated, true);
    assert.equal(result.status, CustomerStatus.INVALID);
    assert.equal(customer?.status, CustomerStatus.INVALID);
    assert.equal(customer?.invalidReason, 'Unsolicited SEO service promotion, not a product inquiry.');
  });

  it('keeps customer status unchanged for low-confidence invalid classification', async () => {
    const repository = new InMemoryCustomerRepository();
    const useCase = new UpdateCustomerStatusFromAiAnalysisUseCase(repository);

    const result = await useCase.execute({
      customerEmail: 'maybe@example.com',
      analysis: createAnalysis({
        classification: 'invalid',
        confidence: 0.6,
        reason: 'Could be unrelated, but confidence is low.',
      }),
    });

    const customer = await repository.findByEmail('maybe@example.com');
    assert.equal(result.updated, false);
    assert.equal(customer, undefined);
  });
});

function createAnalysis(overrides: {
  classification: 'valid_inquiry' | 'invalid' | 'unknown';
  confidence: number;
  reason: string;
}) {
  return {
    isInquiry: overrides.classification === 'valid_inquiry',
    classification: overrides.classification,
    suggestedStatus: InquiryStatus.NEED_ENGINEER_REVIEW,
    confidence: overrides.confidence,
    riskLevel: 'low' as const,
    reason: overrides.reason,
    missingFields: [],
    extractedRequirements: {},
    quoteBoundaryDetected: false,
    humanReviewRequired: true,
    nextAction: 'Review manually.',
  };
}
