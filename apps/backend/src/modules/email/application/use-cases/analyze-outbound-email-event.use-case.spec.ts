import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BuildAiContextUseCase } from '../../../context/application/use-cases/build-ai-context.use-case.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import type { EmailAiAnalysisAdapter } from '../ports/email-ai-analysis.adapter.js';
import { AnalyzeOutboundEmailEventUseCase } from './analyze-outbound-email-event.use-case.js';

describe('AnalyzeOutboundEmailEventUseCase', () => {
  it('retries invalid output and accepts a later schema-valid result', async () => {
    const adapter = new SequentialAdapter([
      'not-json',
      JSON.stringify(validAnalysis()),
    ]);
    const useCase = new AnalyzeOutboundEmailEventUseCase(adapter, fakeContextBuilder());

    const result = await useCase.execute(createInput());

    assert.equal(result.success, true);
    assert.equal(adapter.calls.length, 2);
    assert.equal(adapter.calls[0]?.length, 2);
    assert.equal(adapter.calls[1]?.length, 3);
    assert.match(adapter.calls[1]?.at(-1)?.content ?? '', /failed validation/i);
  });

  it('returns a parse error after the initial call and two repair attempts fail', async () => {
    const adapter = new SequentialAdapter(['not-json']);
    const useCase = new AnalyzeOutboundEmailEventUseCase(adapter, fakeContextBuilder());

    const result = await useCase.execute(createInput());

    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.errorCode, 'ai_json_parse_failed');
    assert.equal(adapter.calls.length, 3);
  });
});

class SequentialAdapter implements EmailAiAnalysisAdapter {
  readonly calls: Array<Array<{ role: string; content: string }>> = [];
  private index = 0;

  constructor(private readonly outputs: string[]) {}

  async analyze(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
    this.calls.push(messages);
    const output = this.outputs[this.index] ?? this.outputs.at(-1) ?? '';
    this.index += 1;
    return output;
  }
}

function fakeContextBuilder(): BuildAiContextUseCase {
  return {
    execute: async () => ({
      contextSnapshotId: 'snapshot_001',
      estimatedTokens: 50,
      contextPayload: {} as never,
      messages: [
        { role: 'system' as const, content: 'classify outbound email' },
        { role: 'user' as const, content: '{}' },
      ],
      sourceReferences: [],
    }),
  } as unknown as BuildAiContextUseCase;
}

function createInput() {
  const now = new Date('2026-07-14T01:00:00.000Z');
  return {
    emailMessage: {
      id: 'email_outbound_001',
      externalMessageId: 'message_outbound_001',
      direction: EmailDirection.OUTBOUND,
      source: EmailSource.IMAP,
      fromEmail: 'sales@example.com',
      toEmails: ['buyer@example.net'],
      ccEmails: [],
      subject: 'Please confirm delivery time',
      bodyText: 'Can you accept delivery in four to six weeks?',
      receivedAt: now,
      createdAt: now,
    },
    inquiryCase: {
      id: 'inquiry_001',
      customerEmail: 'buyer@example.net',
      subject: 'RF isolator inquiry',
      status: InquiryStatus.NEED_CLARIFICATION,
      latestMessageAt: now,
      createdAt: now,
      updatedAt: now,
    },
    recentEmailMessages: [],
  };
}

function validAnalysis() {
  return {
    eventType: 'customer_response_requested',
    responseExpected: true,
    suggestedStatus: InquiryStatus.WAITING_CUSTOMER,
    confidence: 0.96,
    riskLevel: 'low',
    commercialBoundaryDetected: false,
    humanReviewRequired: false,
    reason: 'The outbound email explicitly asks the customer to confirm delivery time.',
  };
}
