import { randomUUID } from 'node:crypto';

import { EmailMessage } from '../../../email/domain/entities/email-message.entity.js';
import { ContextPurpose } from '../../domain/enums/context-purpose.enum.js';
import { ContextSourceType } from '../../domain/enums/context-source-type.enum.js';
import { AiContextSnapshot } from '../../domain/entities/ai-context-snapshot.entity.js';
import { AiChatMessage } from '../../domain/value-objects/ai-chat-message.vo.js';
import { ContextSourceReference } from '../../domain/value-objects/context-source-reference.vo.js';
import {
  AiEmailAnalysisContextPayload,
  aiEmailAnalysisContextPayloadSchema,
} from '../dto/ai-email-analysis-context.schema.js';
import { BuildAiContextInput } from '../dto/build-ai-context.dto.js';
import { ContextSnapshotResponseDto } from '../dto/context-snapshot-response.dto.js';
import { RagReference } from '../ports/rag-retriever.adapter.js';
import { ContextSnapshotRepository } from '../ports/context-snapshot.repository.js';
import { RagRetrieverAdapter } from '../ports/rag-retriever.adapter.js';
import { TokenEstimator } from '../ports/token-estimator.js';

export class BuildAiContextUseCase {
  constructor(
    private readonly contextSnapshotRepository: ContextSnapshotRepository,
    private readonly tokenEstimator: TokenEstimator,
    private readonly ragRetrieverAdapter: RagRetrieverAdapter,
  ) {}

  async execute(input: BuildAiContextInput): Promise<ContextSnapshotResponseDto> {
    const recentThreadMessages = selectRecentThreadMessages(
      input.recentEmailMessages ?? [],
      input.currentEmailMessage.id,
    );
    const ragReferences = await this.ragRetrieverAdapter.retrieve({
      inquiryCaseId: input.inquiryCase.id,
      emailMessageId: input.currentEmailMessage.id,
      purpose: input.purpose,
      query: [
        input.currentEmailMessage.subject,
        input.currentEmailMessage.bodyText,
      ].filter(Boolean).join('\n'),
      limit: 5,
    });
    const contextPayload = aiEmailAnalysisContextPayloadSchema.parse(
      buildContextPayload(input, recentThreadMessages, ragReferences),
    );

    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content: input.systemPrompt,
      },
      {
        role: 'user',
        content: JSON.stringify(contextPayload, null, 2),
      },
    ];

    const sources = buildSources(input, recentThreadMessages, ragReferences);
    const estimatedTokens = this.tokenEstimator.estimateMessages(messages);
    const snapshot: AiContextSnapshot = {
      id: `ctx_${randomUUID()}`,
      inquiryCaseId: input.inquiryCase.id,
      emailMessageId: input.currentEmailMessage.id,
      purpose: input.purpose,
      contextPayload,
      messages,
      sourceReferences: sources,
      estimatedTokens,
      createdAt: new Date(),
    };

    const savedSnapshot = await this.contextSnapshotRepository.save(snapshot);

    return {
      contextSnapshotId: savedSnapshot.id,
      inquiryCaseId: input.inquiryCase.id,
      emailMessageId: input.currentEmailMessage.id,
      purpose: input.purpose,
      contextPayload,
      messages,
      sources,
      estimatedTokens,
    };
  }
}

function selectRecentThreadMessages(messages: EmailMessage[], currentEmailMessageId: string): EmailMessage[] {
  return messages
    .filter((message) => message.id !== currentEmailMessageId)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
}

function buildContextPayload(
  input: BuildAiContextInput,
  recentThreadMessages: EmailMessage[],
  ragReferences: RagReference[],
): AiEmailAnalysisContextPayload {
  return {
    inquiryState: {
      status: input.inquiryCase.status,
      customerEmail: input.inquiryCase.customerEmail,
      subject: formatSubject(input.inquiryCase.subject),
      latestMessageAt: input.inquiryCase.latestMessageAt.toISOString(),
    },
    recentThreadMessages: recentThreadMessages.map(formatThreadMessage),
    ragReferences: ragReferences.map((reference) => ({
      title: reference.sourceTitle || 'reference',
      content: reference.content || '(empty)',
      score: reference.score,
    })),
    currentEmail: {
      ...formatThreadMessage(input.currentEmailMessage),
      to: formatRecipients(input.currentEmailMessage.toEmails),
      subject: formatSubject(input.currentEmailMessage.subject),
    },
    outputInstruction: {
      format: 'json_only',
      schema: {
        isInquiry: 'boolean',
        classification: 'valid_inquiry | invalid | unknown',
        suggestedStatus: 'new | need_clarification | need_engineer_review | ready_for_quote | quoted | closed | invalid',
        confidence: 'number between 0 and 1',
        riskLevel: 'low | medium | high',
        reason: 'string',
        missingFields: 'string[]',
        extractedRequirements: 'object with string values',
        quoteBoundaryDetected: 'boolean',
        humanReviewRequired: 'boolean',
        nextAction: 'string',
      },
    },
  };
}

function formatThreadMessage(message: EmailMessage): {
  direction: EmailMessage['direction'];
  from: string;
  to?: string;
  subject?: string;
  receivedAt: string;
  cleanBody: string;
} {
  return {
    direction: message.direction,
    from: formatSender(message),
    to: message.toEmails.length > 0 ? formatRecipients(message.toEmails) : undefined,
    subject: message.subject ? formatSubject(message.subject) : undefined,
    receivedAt: message.receivedAt.toISOString(),
    cleanBody: message.bodyText || message.bodyHtml || '(empty)',
  };
}

function formatSender(message: EmailMessage): string {
  return message.fromName
    ? `${message.fromName} <${message.fromEmail}>`
    : message.fromEmail;
}

function formatRecipients(recipients: string[]): string {
  return recipients.length > 0 ? recipients.join(', ') : '(none)';
}

function formatSubject(subject: string): string {
  return subject.trim() || '(no subject)';
}

function buildSources(
  input: BuildAiContextInput,
  recentThreadMessages: EmailMessage[],
  ragReferences: Array<{ sourceId?: string; sourceTitle: string }>,
): ContextSourceReference[] {
  return [
    {
      sourceType: ContextSourceType.SYSTEM,
      label: 'system prompt',
    },
    {
      sourceType: ContextSourceType.STATE,
      sourceId: input.inquiryCase.id,
      label: 'current inquiry state',
    },
    {
      sourceType: ContextSourceType.EMAIL,
      sourceId: input.currentEmailMessage.id,
      label: 'current email',
    },
    ...recentThreadMessages.map((message) => ({
      sourceType: ContextSourceType.EMAIL,
      sourceId: message.id,
      label: 'recent thread email',
    })),
    ...ragReferences.map((reference) => ({
      sourceType: ContextSourceType.RAG,
      sourceId: reference.sourceId,
      label: reference.sourceTitle,
    })),
  ];
}
