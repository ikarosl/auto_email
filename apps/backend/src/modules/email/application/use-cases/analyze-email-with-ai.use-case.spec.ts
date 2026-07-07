import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { EmailAiAnalysisAdapter } from '../ports/email-ai-analysis.adapter.js';
import { AnalyzeEmailWithAiUseCase } from './analyze-email-with-ai.use-case.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { AiInteractionDebugLogger, AiInteractionDebugLogEntry } from '../ports/ai-interaction-debug-logger.js';

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

  it('retries after invalid output and returns a later valid JSON result', async () => {
    const logger = new MemoryAiInteractionDebugLogger();
    const useCase = new AnalyzeEmailWithAiUseCase(
      new SequentialAiAdapter([
        'I think this is an inquiry.',
        JSON.stringify(createValidAnalysis()),
      ]),
      undefined,
      logger,
    );

    const result = await useCase.execute(createEmailMessage());

    assert.equal(result.success, true);
    assert.equal(logger.entries.length, 1);
    assert.equal(logger.entries[0]?.successfulAttempt, 2);
    assert.equal(logger.entries[0]?.attempts?.length, 2);
    assert.equal(logger.entries[0]?.attempts?.[0]?.usedRepairInstruction, false);
    assert.equal(logger.entries[0]?.attempts?.[1]?.usedRepairInstruction, true);
    assert.equal(logger.entries[0]?.attempts?.[0]?.messageCount, 2);
    assert.equal(logger.entries[0]?.attempts?.[1]?.messageCount, 3);
    assert.match(logger.entries[0]?.attempts?.[1]?.repairInstructionMessage?.content ?? '', /retry_repair_instruction/);
    assert.equal('messages' in (logger.entries[0]?.attempts?.[0] ?? {}), false);
  });

  it('does not retry when numeric extracted requirements are coercible', async () => {
    const logger = new MemoryAiInteractionDebugLogger();
    const useCase = new AnalyzeEmailWithAiUseCase(
      new StaticAiAdapter(JSON.stringify(createValidAnalysis({
        extractedRequirements: {
          productType: 'isolator',
          quantity: 50,
          power: 20,
        },
      }))),
      undefined,
      logger,
    );

    const result = await useCase.execute(createEmailMessage());

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.analysis.extractedRequirements.quantity, '50');
      assert.equal(result.analysis.extractedRequirements.power, '20');
    }
    assert.equal(logger.entries[0]?.successfulAttempt, 1);
    assert.equal(logger.entries[0]?.attempts?.length, 1);
    assert.equal(logger.entries[0]?.attempts?.[0]?.messageCount, 2);
    assert.equal(logger.entries[0]?.attempts?.[0]?.usedRepairInstruction, false);
  });

  it('returns a safe failure after all retry attempts fail', async () => {
    const logger = new MemoryAiInteractionDebugLogger();
    const adapter = new StaticAiAdapter('not json');
    const useCase = new AnalyzeEmailWithAiUseCase(adapter, undefined, logger);

    const result = await useCase.execute(createEmailMessage());

    assert.equal(result.success, false);
    assert.equal(adapter.calls, 3);
    assert.equal(logger.entries[0]?.attempts?.length, 3);
    assert.equal(logger.entries[0]?.validationError?.errorCode, 'ai_json_parse_failed');
    assert.equal(logger.entries[0]?.attempts?.[2]?.usedRepairInstruction, true);
  });
});

class StaticAiAdapter implements EmailAiAnalysisAdapter {
  calls = 0;

  constructor(private readonly output: string) {}

  async analyze(): Promise<string> {
    this.calls += 1;
    return this.output;
  }
}

class SequentialAiAdapter implements EmailAiAnalysisAdapter {
  private index = 0;

  constructor(private readonly outputs: string[]) {}

  async analyze(): Promise<string> {
    const output = this.outputs[this.index] ?? this.outputs.at(-1) ?? '';
    this.index += 1;
    return output;
  }
}

class MemoryAiInteractionDebugLogger implements AiInteractionDebugLogger {
  readonly entries: AiInteractionDebugLogEntry[] = [];

  async log(entry: AiInteractionDebugLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

function createValidAnalysis(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
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
