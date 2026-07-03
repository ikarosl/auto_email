import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EmailDirection } from '../../../email/domain/enums/email-direction.enum.js';
import { EmailSource } from '../../../email/domain/enums/email-source.enum.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { ContextPurpose } from '../../domain/enums/context-purpose.enum.js';
import { InMemoryContextSnapshotRepository } from '../../infrastructure/repositories/in-memory-context-snapshot.repository.js';
import { NoopRagRetrieverAdapter } from '../../infrastructure/adapters/noop-rag-retriever.adapter.js';
import { SimpleTokenEstimator } from '../../infrastructure/adapters/simple-token-estimator.js';
import { BuildAiContextUseCase } from './build-ai-context.use-case.js';

describe('BuildAiContextUseCase', () => {
  it('builds context messages and saves a snapshot', async () => {
    const snapshotRepository = new InMemoryContextSnapshotRepository();
    const useCase = new BuildAiContextUseCase(
      snapshotRepository,
      new SimpleTokenEstimator(),
      new NoopRagRetrieverAdapter(),
    );

    const result = await useCase.execute({
      inquiryCase: {
        id: 'inquiry_001',
        customerEmail: 'buyer@example.com',
        subject: 'RF circulator inquiry',
        status: InquiryStatus.NEW,
        latestMessageAt: new Date('2026-06-23T00:00:00.000Z'),
        createdAt: new Date('2026-06-23T00:00:00.000Z'),
        updatedAt: new Date('2026-06-23T00:00:00.000Z'),
      },
      currentEmailMessage: {
        id: 'email_001',
        externalMessageId: 'message_001',
        direction: EmailDirection.INBOUND,
        source: EmailSource.MOCK,
        fromEmail: 'buyer@example.com',
        toEmails: ['sales@example.com'],
        ccEmails: [],
        subject: 'RF circulator inquiry',
        bodyText: 'We need a 12-15GHz circulator, 10 pcs.',
        receivedAt: new Date('2026-06-23T00:00:00.000Z'),
        createdAt: new Date('2026-06-23T00:00:00.000Z'),
      },
      purpose: ContextPurpose.EMAIL_ANALYSIS,
      systemPrompt: 'system rules',
      outputFormatInstruction: 'Return JSON.',
    });

    const savedSnapshot = await snapshotRepository.findById(result.contextSnapshotId);

    assert.equal(result.messages.length, 7);
    assert.equal(result.messages[0]?.role, 'system');
    assert.equal(result.messages.slice(1).every((message) => message.role === 'user'), true);
    assert.match(result.messages[1]?.content ?? '', /Context section: inquiry_state/);
    assert.match(result.messages[1]?.content ?? '', /Current inquiry state/);
    assert.match(result.messages[5]?.content ?? '', /Context section: current_email/);
    assert.match(result.messages[5]?.content ?? '', /Current customer email/);
    assert.match(result.messages[6]?.content ?? '', /Context section: output_instruction/);
    assert.ok(result.estimatedTokens > 0);
    assert.equal(savedSnapshot?.purpose, ContextPurpose.EMAIL_ANALYSIS);
    assert.equal(savedSnapshot?.emailMessageId, 'email_001');
  });
});
