import { randomUUID } from 'node:crypto';

import { EmailDirection } from '../../../email/domain/enums/email-direction.enum.js';
import { EmailMessage } from '../../../email/domain/entities/email-message.entity.js';
import { ContextPurpose } from '../../domain/enums/context-purpose.enum.js';
import { ContextSourceType } from '../../domain/enums/context-source-type.enum.js';
import { AiContextSnapshot } from '../../domain/entities/ai-context-snapshot.entity.js';
import { DEFAULT_EMAIL_ANALYSIS_CONTEXT_BUDGET } from '../../domain/value-objects/context-budget.vo.js';
import { AiChatMessage } from '../../domain/value-objects/ai-chat-message.vo.js';
import { ContextSourceReference } from '../../domain/value-objects/context-source-reference.vo.js';
import { BuildAiContextInput } from '../dto/build-ai-context.dto.js';
import { ContextSnapshotResponseDto } from '../dto/context-snapshot-response.dto.js';
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
    const budget = input.budget ?? DEFAULT_EMAIL_ANALYSIS_CONTEXT_BUDGET;
    const recentEmails = selectRecentEmails(input.recentEmailMessages ?? [], input.currentEmailMessage.id);
    const recentOurReplies = selectRecentOurReplies(input.recentOurReplies ?? []);
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

    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content: input.systemPrompt,
      },
      {
        role: 'user',
        content: [
          `Context purpose: ${input.purpose}`,
          '',
          formatStateSection(input),
          formatRecentMessagesSection(recentEmails, budget.recentMessagesTokens),
          formatRecentOurRepliesSection(recentOurReplies),
          formatRagSection(ragReferences),
          formatCurrentEmailSection(input.currentEmailMessage, budget.currentEmailTokens),
          '',
          input.outputFormatInstruction,
        ].filter(Boolean).join('\n'),
      },
    ];

    const sources = buildSources(input, recentEmails, recentOurReplies, ragReferences);
    const estimatedTokens = this.tokenEstimator.estimateMessages(messages);
    const snapshot: AiContextSnapshot = {
      id: `ctx_${randomUUID()}`,
      inquiryCaseId: input.inquiryCase.id,
      emailMessageId: input.currentEmailMessage.id,
      purpose: input.purpose,
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
      messages,
      sources,
      estimatedTokens,
    };
  }
}

function selectRecentEmails(messages: EmailMessage[], currentEmailMessageId: string): EmailMessage[] {
  return messages
    .filter((message) => message.id !== currentEmailMessageId)
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, 5)
    .reverse();
}

function selectRecentOurReplies(messages: EmailMessage[]): EmailMessage[] {
  return messages
    .filter((message) => message.direction === EmailDirection.OUTBOUND)
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, 3)
    .reverse();
}

function formatStateSection(input: BuildAiContextInput): string {
  return [
    'Current inquiry state:',
    JSON.stringify({
      inquiryCaseId: input.inquiryCase.id,
      status: input.inquiryCase.status,
      customerEmail: input.inquiryCase.customerEmail,
      subject: input.inquiryCase.subject,
      latestMessageAt: input.inquiryCase.latestMessageAt.toISOString(),
    }, null, 2),
  ].join('\n');
}

function formatRecentMessagesSection(messages: EmailMessage[], tokenLimit: number): string {
  if (messages.length === 0) {
    return 'Recent email window: none';
  }

  return [
    `Recent email window, approximate budget ${tokenLimit} tokens:`,
    ...messages.map((message) => formatEmailMessage(message, 1200)),
  ].join('\n\n');
}

function formatRecentOurRepliesSection(messages: EmailMessage[]): string {
  if (messages.length === 0) {
    return 'Recent our reply window: none';
  }

  return [
    'Recent our reply window:',
    ...messages.map((message) => formatEmailMessage(message, 1200)),
  ].join('\n\n');
}

function formatRagSection(references: Array<{ sourceTitle: string; content: string; score?: number }>): string {
  if (references.length === 0) {
    return 'RAG references: none';
  }

  return [
    'RAG references:',
    ...references.map((reference) => [
      `Title: ${reference.sourceTitle}`,
      reference.score === undefined ? undefined : `Score: ${reference.score}`,
      truncate(reference.content, 1200),
    ].filter(Boolean).join('\n')),
  ].join('\n\n');
}

function formatCurrentEmailSection(message: EmailMessage, tokenLimit: number): string {
  return [
    `Current customer email, approximate budget ${tokenLimit} tokens:`,
    formatEmailMessage(message, 8000),
  ].join('\n');
}

function formatEmailMessage(message: EmailMessage, maxLength: number): string {
  return [
    `EmailMessage ID: ${message.id}`,
    `Direction: ${message.direction}`,
    `From: ${message.fromName || ''} <${message.fromEmail}>`,
    `To: ${message.toEmails.join(', ')}`,
    `Subject: ${message.subject}`,
    `ReceivedAt: ${message.receivedAt.toISOString()}`,
    'Body:',
    truncate(message.bodyText || message.bodyHtml || '(empty)', maxLength),
  ].join('\n');
}

function buildSources(
  input: BuildAiContextInput,
  recentEmails: EmailMessage[],
  recentOurReplies: EmailMessage[],
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
    ...recentEmails.map((message) => ({
      sourceType: ContextSourceType.EMAIL,
      sourceId: message.id,
      label: 'recent email',
    })),
    ...recentOurReplies.map((message) => ({
      sourceType: ContextSourceType.EMAIL,
      sourceId: message.id,
      label: 'recent our reply',
    })),
    ...ragReferences.map((reference) => ({
      sourceType: ContextSourceType.RAG,
      sourceId: reference.sourceId,
      label: reference.sourceTitle,
    })),
  ];
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n[truncated ${value.length - maxLength} chars]`;
}
