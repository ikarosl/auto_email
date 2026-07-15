import { randomUUID } from 'node:crypto';

import { BusinessError } from '../../../../common/errors/business-error.js';
import { PrismaService } from '../../../../common/database/prisma.service.js';
import { BuildAiContextUseCase } from '../../../context/application/use-cases/build-ai-context.use-case.js';
import { ContextPurpose } from '../../../context/domain/enums/context-purpose.enum.js';
import type { InquiryMessageRepository } from '../../../inquiry/application/ports/inquiry-message.repository.js';
import type { InquiryRepository } from '../../../inquiry/application/ports/inquiry.repository.js';
import {
  InquiryActionOwner,
  InquiryBusinessStage,
} from '../../../inquiry/domain/enums/inquiry-state.enum.js';
import type { EmailMessageRepository } from '../ports/email-message.repository.js';
import type { ReplyDraftAiAdapter } from '../ports/reply-draft-ai.adapter.js';
import {
  AI_REPLY_DRAFT_OUTPUT_SCHEMA,
  aiReplyDraftSchema,
  type AiReplyDraftOutput,
} from '../dto/ai-reply-draft.schema.js';
import { getReplyDraftSystemPrompt } from '../prompts/reply-draft.prompt.js';

const MAX_ATTEMPTS = 3;

export interface GenerateReplyDraftInput {
  inquiryCaseId: string;
  sourceEmailMessageId?: string;
  emailAnalysisDecisionId?: string;
  commercialTerms?: string;
  initiatedBy?: string;
  regenerate?: boolean;
}

export class GenerateReplyDraftUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inquiryRepository: InquiryRepository,
    private readonly inquiryMessageRepository: InquiryMessageRepository,
    private readonly emailMessageRepository: EmailMessageRepository,
    private readonly buildAiContextUseCase: BuildAiContextUseCase,
    private readonly aiAdapter: ReplyDraftAiAdapter,
  ) {}

  async execute(input: GenerateReplyDraftInput) {
    const inquiry = await this.inquiryRepository.findById(input.inquiryCaseId);
    if (!inquiry) throw new BusinessError('Inquiry not found.', 'INQUIRY_NOT_FOUND');

    const draftType = resolveDraftType(inquiry.businessStage, inquiry.actionOwner);
    if (draftType === 'quote_reply' && !input.commercialTerms?.trim()) {
      throw new BusinessError(
        'Quote draft generation requires human-confirmed commercial terms.',
        'COMMERCIAL_TERMS_REQUIRED',
      );
    }

    const inquiryLinks = await this.inquiryMessageRepository.listByInquiryCaseId(input.inquiryCaseId);
    const messages = (await Promise.all(
      inquiryLinks.map((link) => this.emailMessageRepository.findById(link.emailMessageId)),
    )).filter((message): message is NonNullable<typeof message> => Boolean(message));
    const sourceMessage = input.sourceEmailMessageId
      ? messages.find((message) => message.id === input.sourceEmailMessageId)
      : [...messages].reverse().find((message) => message.direction === 'inbound');
    if (!sourceMessage) {
      throw new BusinessError('A source customer email is required to generate a draft.', 'SOURCE_EMAIL_REQUIRED');
    }

    const promptVersion = process.env.AI_REPLY_DRAFT_PROMPT_VERSION?.trim() || 'v1';
    const stableKey = `auto:${sourceMessage.id}:${draftType}:${promptVersion}`;
    if (!input.regenerate) {
      const existing = await this.prisma.replyDraft.findUnique({ where: { idempotencyKey: stableKey } });
      if (existing) return existing;
    }

    const context = await this.buildAiContextUseCase.execute({
      inquiryCase: inquiry,
      currentEmailMessage: sourceMessage,
      purpose: ContextPurpose.REPLY_DRAFT,
      systemPrompt: getReplyDraftSystemPrompt(),
      outputFormatInstruction: 'Return only valid JSON.',
      outputSchema: AI_REPLY_DRAFT_OUTPUT_SCHEMA,
      humanInstructions: input.commercialTerms,
      recentEmailMessages: messages,
    });
    const output = await this.generateValidated(context.messages);
    const now = new Date();
    const version = input.regenerate
      ? (await this.prisma.replyDraft.count({ where: { inquiryCaseId: input.inquiryCaseId } })) + 1
      : 1;

    return this.prisma.$transaction(async (tx) => {
      if (input.regenerate) {
        await tx.replyDraft.updateMany({
          where: {
            inquiryCaseId: input.inquiryCaseId,
            status: { in: ['pending_review', 'approved', 'rejected'] },
          },
          data: { status: 'expired', updatedAt: now },
        });
      }

      return tx.replyDraft.create({
        data: {
          id: `draft_${randomUUID()}`,
          inquiryCaseId: input.inquiryCaseId,
          sourceEmailMessageId: sourceMessage.id,
          contextSnapshotId: context.contextSnapshotId,
          emailAnalysisDecisionId: input.emailAnalysisDecisionId ?? null,
          idempotencyKey: input.regenerate ? `${stableKey}:regen:${randomUUID()}` : stableKey,
          draftType: output.draftType,
          status: 'pending_review',
          subject: output.subject,
          bodyText: output.bodyText,
          originalSubject: output.subject,
          originalBodyText: output.bodyText,
          language: output.language,
          usedFactsJson: output.usedFacts,
          unresolvedQuestionsJson: output.unresolvedQuestions,
          warningsJson: output.warnings,
          requiresCommercialReview: output.requiresCommercialReview,
          promptVersion,
          modelName: process.env.AI_REPLY_DRAFT_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
          version,
          createdByType: input.initiatedBy ? 'human_ai_assisted' : 'ai',
          createdAt: now,
          updatedAt: now,
        },
      });
    });
  }

  private async generateValidated(baseMessages: Parameters<ReplyDraftAiAdapter['generate']>[0]): Promise<AiReplyDraftOutput> {
    let lastError = 'AI returned no usable draft.';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const repair = attempt === 1 ? [] : [{
        role: 'user' as const,
        content: `The previous draft output failed validation: ${lastError}. Return only one JSON object matching outputInstruction.schema.`,
      }];
      const raw = (await this.aiAdapter.generate([...baseMessages, ...repair])).trim();
      try {
        const parsed = JSON.parse(extractJson(raw));
        const result = aiReplyDraftSchema.safeParse(parsed);
        if (result.success) return result.data;
        lastError = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    throw new BusinessError(lastError, 'AI_REPLY_DRAFT_VALIDATION_FAILED');
  }
}

function resolveDraftType(
  businessStage: InquiryBusinessStage,
  actionOwner: InquiryActionOwner,
): AiReplyDraftOutput['draftType'] {
  if (actionOwner !== InquiryActionOwner.US) {
    throw new BusinessError('Reply draft generation requires actionOwner=us.', 'DRAFT_ACTION_OWNER_NOT_US');
  }
  if (businessStage === InquiryBusinessStage.INTAKE) return 'clarification_request';
  if (businessStage === InquiryBusinessStage.TECHNICAL_REVIEW) return 'engineer_review_acknowledgement';
  if (businessStage === InquiryBusinessStage.COMMERCIAL) return 'quote_reply';
  throw new BusinessError(
    `Reply draft generation is not enabled for business stage ${businessStage}.`,
    'DRAFT_STATUS_NOT_SUPPORTED',
  );
}

function extractJson(raw: string): string {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI output did not contain a JSON object.');
  return cleaned.slice(start, end + 1);
}
