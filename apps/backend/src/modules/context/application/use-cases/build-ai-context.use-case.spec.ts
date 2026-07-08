import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EmailDirection } from '../../../email/domain/enums/email-direction.enum.js';
import { EmailSource } from '../../../email/domain/enums/email-source.enum.js';
import { EmailMessageAttachment } from '../../../email/domain/entities/email-message.entity.js';
import { ContextSourceType } from '../../domain/enums/context-source-type.enum.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { ContextPurpose } from '../../domain/enums/context-purpose.enum.js';
import { aiEmailAnalysisContextPayloadSchema } from '../dto/ai-email-analysis-context.schema.js';
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
      currentEmailMessage: createEmailMessage({
        id: 'email_001',
        receivedAt: new Date('2026-06-23T00:04:00.000Z'),
        bodyText: 'We need a 12-15GHz circulator, 10 pcs.',
        attachments: [
          {
            id: 'attachment_current',
            fileName: 'current-datasheet.pdf',
            mimeType: 'application/pdf',
            fileSize: 4096,
            parseStatus: 'parsed',
            textSource: 'pdf_text',
            parsedTextPreview: 'Current datasheet preview.',
            parsedText: 'Current datasheet full parsed text.',
          },
        ],
      }),
      purpose: ContextPurpose.EMAIL_ANALYSIS,
      systemPrompt: 'system rules',
      outputFormatInstruction: 'Return JSON.',
      recentEmailMessages: [
        createEmailMessage({
          id: 'email_002',
          direction: EmailDirection.OUTBOUND,
          fromEmail: 'sales@example.com',
          toEmails: ['buyer@example.com'],
          receivedAt: new Date('2026-06-23T00:03:00.000Z'),
          bodyText: 'We can offer 4 to 6 weeks delivery.',
        }),
        createEmailMessage({
          id: 'email_003',
          receivedAt: new Date('2026-06-23T00:01:00.000Z'),
          bodyText: 'Initial inquiry body.',
          attachments: [
            {
              id: 'attachment_recent',
              fileName: 'history-datasheet.pdf',
              mimeType: 'application/pdf',
              fileSize: 2048,
              parseStatus: 'parsed',
              textSource: 'pdf_text',
              parsedTextPreview: 'Historical datasheet preview.',
              parsedText: 'Historical datasheet full parsed text should not be sent.',
            },
          ],
        }),
        createEmailMessage({
          id: 'email_001',
          receivedAt: new Date('2026-06-23T00:04:00.000Z'),
          bodyText: 'We need a 12-15GHz circulator, 10 pcs.',
        }),
      ],
    });

    const savedSnapshot = await snapshotRepository.findById(result.contextSnapshotId);
    const payload = aiEmailAnalysisContextPayloadSchema.parse(
      JSON.parse(result.messages[1]?.content ?? '{}'),
    );

    assert.equal(result.messages.length, 2);
    assert.deepEqual(result.contextPayload, payload);
    assert.equal(result.messages[0]?.role, 'system');
    assert.equal(result.messages[0]?.content, 'system rules');
    assert.equal(result.messages[1]?.role, 'user');
    assert.equal(payload.inquiryState.status, InquiryStatus.NEW);
    assert.equal(payload.currentEmail.cleanBody, 'We need a 12-15GHz circulator, 10 pcs.');
    assert.equal(payload.currentEmail.attachments?.[0]?.parsedText, 'Current datasheet full parsed text.');
    assert.equal(
      payload.recentThreadMessages[0]?.attachments?.[0]?.parsedTextPreview,
      'Historical datasheet preview.',
    );
    assert.equal(payload.recentThreadMessages[0]?.attachments?.[0]?.parsedText, undefined);
    assert.deepEqual(
      payload.recentThreadMessages.map((message) => message.receivedAt),
      [
        '2026-06-23T00:01:00.000Z',
        '2026-06-23T00:03:00.000Z',
      ],
    );
    assert.equal(
      payload.recentThreadMessages.filter((message) => message.direction === EmailDirection.OUTBOUND).length,
      1,
    );
    assert.doesNotMatch(result.messages[1]?.content ?? '', /EmailMessage ID/);
    assert.doesNotMatch(result.messages[1]?.content ?? '', /approximate budget/);
    assert.doesNotMatch(result.messages[1]?.content ?? '', /Context section/);
    assert.equal(
      result.sources.filter((source) => source.sourceType === ContextSourceType.ATTACHMENT).length,
      2,
    );
    assert.equal(
      result.sources.find((source) => source.sourceId === 'attachment_current')?.emailMessageId,
      'email_001',
    );
    assert.ok(result.estimatedTokens > 0);
    assert.equal(savedSnapshot?.purpose, ContextPurpose.EMAIL_ANALYSIS);
    assert.equal(savedSnapshot?.emailMessageId, 'email_001');
    assert.deepEqual(savedSnapshot?.contextPayload, result.contextPayload);
    assert.deepEqual(JSON.parse(savedSnapshot?.messages[1]?.content ?? '{}'), result.contextPayload);
  });
});

function createEmailMessage(overrides: Partial<{
  id: string;
  direction: EmailDirection;
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  subject: string;
  bodyText: string;
  attachments: EmailMessageAttachment[];
  receivedAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? 'email_default',
    externalMessageId: `${overrides.id ?? 'email_default'}_external`,
    direction: overrides.direction ?? EmailDirection.INBOUND,
    source: EmailSource.MOCK,
    fromEmail: overrides.fromEmail ?? 'buyer@example.com',
    fromName: overrides.fromName,
    toEmails: overrides.toEmails ?? ['sales@example.com'],
    ccEmails: [],
    subject: overrides.subject ?? 'RF circulator inquiry',
    bodyText: overrides.bodyText ?? 'Default body.',
    attachments: overrides.attachments,
    receivedAt: overrides.receivedAt ?? new Date('2026-06-23T00:00:00.000Z'),
    createdAt: overrides.receivedAt ?? new Date('2026-06-23T00:00:00.000Z'),
  };
}
