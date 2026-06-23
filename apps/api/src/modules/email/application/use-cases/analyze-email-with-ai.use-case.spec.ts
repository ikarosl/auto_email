import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { EmailAiAnalysisAdapter } from '../ports/email-ai-analysis.adapter.js';
import { AnalyzeEmailWithAiUseCase } from './analyze-email-with-ai.use-case.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';

describe('AnalyzeEmailWithAiUseCase', () => {
  it('parses and validates valid JSON output', async () => {
    const useCase = new AnalyzeEmailWithAiUseCase(new StaticAiAdapter(JSON.stringify({
      isInquiry: true,
      classification: 'valid_inquiry',
      suggestedStatus: InquiryStatus.NEED_ENGINEER_REVIEW,
      confidence: 0.88,
      riskLevel: 'medium',
      reason: 'Technical requirements are mostly clear.',
      missingFields: [],
      extractedRequirements: {
        productType: 'circulator',
      },
      quoteBoundaryDetected: false,
      humanReviewRequired: true,
      nextAction: 'Send to engineering review after human confirmation.',
    })));

    const result = await useCase.execute(createEmailMessage());

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.analysis.suggestedStatus, InquiryStatus.NEED_ENGINEER_REVIEW);
    }
  });

  it('returns a safe failure for non-json output', async () => {
    const useCase = new AnalyzeEmailWithAiUseCase(new StaticAiAdapter('I think this is an inquiry.'));
    const result = await useCase.execute(createEmailMessage());

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.errorCode, 'ai_json_parse_failed');
      assert.equal(result.humanReviewRequired, true);
    }
  });
});

class StaticAiAdapter implements EmailAiAnalysisAdapter {
  constructor(private readonly output: string) {}

  async analyze(): Promise<string> {
    return this.output;
  }
}

function createEmailMessage(): EmailMessage {
  return {
    id: 'email_001',
    externalMessageId: 'message_001',
    direction: EmailDirection.INBOUND,
    source: EmailSource.MOCK,
    fromEmail: 'buyer@example.com',
    toEmails: ['sales@example.com'],
    ccEmails: [],
    subject: 'Inquiry for circulator',
    bodyText: 'We need a 12-15GHz circulator, 10 pcs.',
    receivedAt: new Date('2026-06-23T00:00:00.000Z'),
    createdAt: new Date('2026-06-23T00:00:00.000Z'),
  };
}
