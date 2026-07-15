import { randomUUID } from 'node:crypto';

import {
  EmailMessage,
  EmailMessageAttachment,
} from '../../../email/domain/entities/email-message.entity.js';
import { ContextPurpose } from '../../domain/enums/context-purpose.enum.js';
import { ContextSourceType } from '../../domain/enums/context-source-type.enum.js';
import { AiContextSnapshot } from '../../domain/entities/ai-context-snapshot.entity.js';
import { AiChatMessage } from '../../domain/value-objects/ai-chat-message.vo.js';
import { ContextSourceReference } from '../../domain/value-objects/context-source-reference.vo.js';
import {
  AiEmailAnalysisContextPayload,
  AiEmailAttachmentContext,
  AiEmailThreadMessageContext,
  AiEmailThreadSummaryContext,
  aiEmailAnalysisContextPayloadSchema,
} from '../dto/ai-email-analysis-context.schema.js';
import { BuildAiContextInput } from '../dto/build-ai-context.dto.js';
import { ContextSnapshotResponseDto } from '../dto/context-snapshot-response.dto.js';
import { ContextBudgetService } from '../services/context-budget.service.js';
import { RagReference } from '../ports/rag-retriever.adapter.js';
import { ContextSnapshotRepository } from '../ports/context-snapshot.repository.js';
import { InquiryContextSummaryRepository } from '../ports/inquiry-context-summary.repository.js';
import { InquiryContextSummaryGenerator } from '../ports/inquiry-context-summary-generator.js';
import { RagRetrieverAdapter } from '../ports/rag-retriever.adapter.js';
import { TokenEstimator } from '../ports/token-estimator.js';
import { InquiryContextSummary } from '../../domain/entities/inquiry-context-summary.entity.js';
import { getEmailAnalysisContextBudgetFromEnv } from '../../domain/value-objects/context-budget.vo.js';

export class BuildAiContextUseCase {
  constructor(
    private readonly contextSnapshotRepository: ContextSnapshotRepository,
    private readonly inquiryContextSummaryRepository: InquiryContextSummaryRepository,
    private readonly inquiryContextSummaryGenerator: InquiryContextSummaryGenerator,
    private readonly tokenEstimator: TokenEstimator,
    private readonly ragRetrieverAdapter: RagRetrieverAdapter,
  ) {}

  async execute(input: BuildAiContextInput): Promise<ContextSnapshotResponseDto> {
    const existingSummary = await this.inquiryContextSummaryRepository.findByInquiryCaseId(
      input.inquiryCase.id,
    );
    const recentThreadMessages = selectRecentThreadMessages(
      input.recentEmailMessages ?? [],
      input.currentEmailMessage.id,
      existingSummary?.coveredMessageIds ?? [],
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
    const initialPayload = aiEmailAnalysisContextPayloadSchema.parse(
      buildContextPayload(input, recentThreadMessages, ragReferences, existingSummary),
    );
    const budgetService = new ContextBudgetService(this.tokenEstimator);
    const budgetResult = budgetService.applyRecentMessageBudget(
      initialPayload,
      input.systemPrompt,
      input.budget ?? getEmailAnalysisContextBudgetFromEnv(process.env),
    );
    const summary = budgetResult.overflowThreadMessages.length > 0
      ? await this.inquiryContextSummaryRepository.save(
        await this.buildRollingSummary(
          existingSummary,
          budgetResult.overflowThreadMessages,
          findOverflowMessageIds(recentThreadMessages, budgetResult.overflowThreadMessages),
          input.inquiryCase.id,
        ),
      )
      : existingSummary;
    const keptRecentEmailMessages = findMatchingMessages(
      recentThreadMessages,
      budgetResult.recentThreadMessages,
    );
    const contextPayload = aiEmailAnalysisContextPayloadSchema.parse(
      buildContextPayload(input, budgetResult.recentThreadMessages, ragReferences, summary),
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

    const sources = buildSources(input, keptRecentEmailMessages, ragReferences, summary);
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

  private async buildRollingSummary(
    existingSummary: InquiryContextSummary | undefined,
    overflowMessages: AiEmailThreadMessageContext[],
    overflowMessageIds: string[],
    inquiryCaseId: string,
  ): Promise<InquiryContextSummary> {
    const generatedSummary = await this.inquiryContextSummaryGenerator.generate({
      inquiryCaseId,
      existingSummary,
      messagesToSummarize: overflowMessages,
    });
    const existingIds = existingSummary?.coveredMessageIds ?? [];
    const coveredMessageIds = Array.from(new Set([...existingIds, ...overflowMessageIds]));
    const coveredDates = [
      existingSummary?.coveredFrom,
      existingSummary?.coveredTo,
      ...overflowMessages.map((message) => new Date(message.receivedAt)),
    ].filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()));

    return {
      id: existingSummary?.id,
      inquiryCaseId,
      summaryText: generatedSummary.summaryText,
      knownFacts: generatedSummary.knownFacts,
      customerDecisions: generatedSummary.customerDecisions,
      ourCommitments: generatedSummary.ourCommitments,
      openQuestions: generatedSummary.openQuestions,
      coveredMessageIds,
      coveredMessageCount: coveredMessageIds.length,
      coveredFrom: coveredDates.length > 0
        ? new Date(Math.min(...coveredDates.map((date) => date.getTime())))
        : undefined,
      coveredTo: coveredDates.length > 0
        ? new Date(Math.max(...coveredDates.map((date) => date.getTime())))
        : undefined,
      updatedAt: new Date(),
    };
  }
}

function selectRecentThreadMessages(
  messages: EmailMessage[],
  currentEmailMessageId: string,
  excludedMessageIds: string[],
): EmailMessage[] {
  const excludedIds = new Set([currentEmailMessageId, ...excludedMessageIds]);

  return messages
    .filter((message) => !excludedIds.has(message.id))
    .filter((message) => process.env.MAIL_OPERATION_MODE !== 'production' || message.source !== 'simulated_send')
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
}

function buildContextPayload(
  input: BuildAiContextInput,
  recentThreadMessages: Array<EmailMessage | AiEmailThreadMessageContext>,
  ragReferences: RagReference[],
  summary?: InquiryContextSummary,
): AiEmailAnalysisContextPayload {
  return {
    inquiryState: {
      businessStage: input.inquiryCase.businessStage,
      actionOwner: input.inquiryCase.actionOwner,
      lifecycleStatus: input.inquiryCase.lifecycleStatus,
      stateVersion: input.inquiryCase.stateVersion,
      customerEmail: input.inquiryCase.customerEmail,
      subject: formatSubject(input.inquiryCase.businessSubject ?? input.inquiryCase.subject),
      latestMessageAt: input.inquiryCase.latestMessageAt.toISOString(),
    },
    ...(summary ? { threadSummary: formatThreadSummary(summary) } : {}),
    recentThreadMessages: recentThreadMessages.map((message) =>
      isFormattedThreadMessage(message) ? message : formatThreadMessage(message, false),
    ),
    ragReferences: ragReferences.map((reference) => ({
      title: reference.sourceTitle || 'reference',
      content: reference.content || '(empty)',
      score: reference.score,
    })),
    currentEmail: {
      ...formatThreadMessage(input.currentEmailMessage, true),
      to: formatRecipients(input.currentEmailMessage.toEmails),
      subject: formatSubject(input.currentEmailMessage.subject),
    },
    ...(input.humanInstructions?.trim()
      ? { humanInstructions: input.humanInstructions.trim() }
      : {}),
    outputInstruction: {
      format: 'json_only',
      schema: input.outputSchema ?? {
        isInquiry: 'boolean',
        messageClassification: 'customer_inquiry | customer_follow_up | our_response | internal | invalid | unrelated_product | commercial_solicitation | unknown',
        inquiryScope: 'object with type, relationshipToExistingInquiry, confidence, detectedProducts',
        events: 'array of { eventType, actor, confidence, evidence, payload }',
        suggestedState: 'object with businessStage, actionOwner, lifecycleStatus',
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

function formatThreadSummary(summary: InquiryContextSummary): AiEmailThreadSummaryContext {
  return {
    summaryText: summary.summaryText,
    coveredMessageCount: summary.coveredMessageCount,
    coveredTimeRange: {
      from: (summary.coveredFrom ?? summary.updatedAt).toISOString(),
      to: (summary.coveredTo ?? summary.updatedAt).toISOString(),
    },
    knownFacts: summary.knownFacts,
    customerDecisions: summary.customerDecisions,
    ourCommitments: summary.ourCommitments,
    openQuestions: summary.openQuestions,
  };
}

function isFormattedThreadMessage(
  message: EmailMessage | AiEmailThreadMessageContext,
): message is AiEmailThreadMessageContext {
  return typeof message.receivedAt === 'string';
}

function formatThreadMessage(message: EmailMessage, includeFullAttachmentText: boolean): {
  direction: EmailMessage['direction'];
  from: string;
  to?: string;
  subject?: string;
  receivedAt: string;
  cleanBody: string;
  attachments?: AiEmailAttachmentContext[];
} {
  const attachments = formatAttachments(message.attachments, includeFullAttachmentText);

  return {
    direction: message.direction,
    from: formatSender(message),
    to: message.toEmails.length > 0 ? formatRecipients(message.toEmails) : undefined,
    subject: message.subject ? formatSubject(message.subject) : undefined,
    receivedAt: message.receivedAt.toISOString(),
    cleanBody: message.bodyText || message.bodyHtml || '(empty)',
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

function formatAttachments(
  attachments: EmailMessageAttachment[] | undefined,
  includeFullText: boolean,
): AiEmailAttachmentContext[] {
  return (attachments ?? [])
    .filter((attachment) => attachment.isContextCandidate !== false)
    .map((attachment) => stripUndefinedValues({
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      parseStatus: attachment.parseStatus,
      textSource: attachment.textSource,
      parsedTextPreview: attachment.parsedTextPreview,
      ...(includeFullText ? { parsedText: attachment.parsedText } : {}),
      parseErrorCode: attachment.parseErrorCode,
      ocrStatus: attachment.ocrStatus,
      ocrTextPreview: attachment.ocrTextPreview,
      ...(includeFullText ? { ocrText: attachment.ocrText } : {}),
      ocrErrorCode: attachment.ocrErrorCode,
      truncated: attachment.truncated,
    }));
}

function stripUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
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
  summary?: InquiryContextSummary,
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
    ...(summary ? [{
      sourceType: ContextSourceType.SUMMARY,
      sourceId: summary.id ?? summary.inquiryCaseId,
      label: 'thread summary',
    }] : []),
    ...recentThreadMessages.map((message) => ({
      sourceType: ContextSourceType.EMAIL,
      sourceId: message.id,
      label: 'recent thread email',
    })),
    ...buildAttachmentSources(input.currentEmailMessage, 'current email attachment'),
    ...recentThreadMessages.flatMap((message) =>
      buildAttachmentSources(message, 'recent thread email attachment'),
    ),
    ...ragReferences.map((reference) => ({
      sourceType: ContextSourceType.RAG,
      sourceId: reference.sourceId,
      label: reference.sourceTitle,
    })),
  ];
}

function findOverflowMessageIds(
  sourceMessages: EmailMessage[],
  overflowMessages: AiEmailThreadMessageContext[],
): string[] {
  return findMatchingMessages(sourceMessages, overflowMessages).map((message) => message.id);
}

function findMatchingMessages(
  sourceMessages: EmailMessage[],
  targetMessages: AiEmailThreadMessageContext[],
): EmailMessage[] {
  const targetKeys = new Set(targetMessages.map(createThreadMessageKey));

  return sourceMessages
    .filter((message) => targetKeys.has(createThreadMessageKey(formatThreadMessage(message, false))));
}

function createThreadMessageKey(message: AiEmailThreadMessageContext): string {
  return [
    message.receivedAt,
    message.direction,
    message.from,
    message.to ?? '',
    message.subject ?? '',
    message.cleanBody,
  ].join('\u001f');
}

function buildAttachmentSources(message: EmailMessage, label: string): ContextSourceReference[] {
  return (message.attachments ?? [])
    .filter((attachment) => attachment.isContextCandidate !== false)
    .map((attachment) => ({
      sourceType: ContextSourceType.ATTACHMENT,
      sourceId: attachment.id,
      emailMessageId: message.id,
      label: attachment.fileName ? `${label}: ${attachment.fileName}` : label,
    }));
}
