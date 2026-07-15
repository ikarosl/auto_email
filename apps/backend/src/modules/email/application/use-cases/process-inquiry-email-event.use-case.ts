import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../../common/database/prisma.service.js';
import { InquiryMessageRepository } from '../../../inquiry/application/ports/inquiry-message.repository.js';
import { ApplyAiSuggestedStatusResult, ApplyAiSuggestedStatusUseCase } from '../../../inquiry/application/use-cases/apply-ai-suggested-status.use-case.js';
import { GenerateBusinessSubjectUseCase } from '../../../inquiry/application/use-cases/generate-business-subject.use-case.js';
import { UpdateCustomerStatusFromAiAnalysisUseCase } from '../../../inquiry/application/use-cases/update-customer-status-from-ai-analysis.use-case.js';
import { UpdateInquiryStructuredFactsFromAiUseCase } from '../../../inquiry/application/use-cases/update-inquiry-structured-facts-from-ai.use-case.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { AiDecisionRepository } from '../ports/ai-decision.repository.js';
import { EmailMessageRepository } from '../ports/email-message.repository.js';
import { AnalyzeEmailWithAiResult, AnalyzeEmailWithAiUseCase } from './analyze-email-with-ai.use-case.js';
import {
  AnalyzeOutboundEmailEventResult,
  AnalyzeOutboundEmailEventUseCase,
  OUTBOUND_EMAIL_EVENT_PROMPT_VERSION,
} from './analyze-outbound-email-event.use-case.js';
import { ApplyOutboundEmailEventUseCase } from './apply-outbound-email-event.use-case.js';
import { GenerateReplyDraftUseCase } from './generate-reply-draft.use-case.js';

export interface ProcessInquiryEmailEventResult {
  kind: 'inbound_analysis' | 'outbound_event' | 'deterministic_send';
  aiAnalysisResult?: AnalyzeEmailWithAiResult;
  aiTransitionResult?: ApplyAiSuggestedStatusResult;
  outboundAnalysisResult?: AnalyzeOutboundEmailEventResult;
  workflowDecisionId?: string;
  workflowExecutionStatus?: string;
  replyDraftId?: string;
  replyDraftError?: string;
  skippedReason?: string;
}

export class ProcessInquiryEmailEventUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyzeEmailWithAiUseCase: AnalyzeEmailWithAiUseCase,
    private readonly analyzeOutboundEmailEventUseCase: AnalyzeOutboundEmailEventUseCase,
    private readonly applyOutboundEmailEventUseCase: ApplyOutboundEmailEventUseCase,
    private readonly inquiryMessageRepository: InquiryMessageRepository,
    private readonly emailMessageRepository: EmailMessageRepository,
    private readonly updateCustomerStatusFromAiAnalysisUseCase: UpdateCustomerStatusFromAiAnalysisUseCase,
    private readonly aiDecisionRepository: AiDecisionRepository,
    private readonly updateInquiryStructuredFactsFromAiUseCase: UpdateInquiryStructuredFactsFromAiUseCase,
    private readonly applyAiSuggestedStatusUseCase: ApplyAiSuggestedStatusUseCase,
    private readonly generateBusinessSubjectUseCase: GenerateBusinessSubjectUseCase,
    private readonly generateReplyDraftUseCase: GenerateReplyDraftUseCase,
  ) {}

  async execute(input: {
    emailMessage: EmailMessage;
    inquiryCase: InquiryCase;
    historicalBackfill?: boolean;
  }): Promise<ProcessInquiryEmailEventResult> {
    const recentEmailMessages = await this.listInquiryEmailMessages(
      input.inquiryCase.id,
      input.emailMessage.receivedAt,
    );

    if (input.emailMessage.direction === EmailDirection.OUTBOUND) {
      if ([EmailSource.SMTP, EmailSource.SIMULATED_SEND].includes(input.emailMessage.source)) {
        return {
          kind: 'deterministic_send',
          skippedReason: 'system_send_event_is_recorded_by_send_workflow',
        };
      }
      return this.processOutbound(input, recentEmailMessages);
    }

    return this.processInbound(input, recentEmailMessages);
  }

  private async processOutbound(
    input: { emailMessage: EmailMessage; inquiryCase: InquiryCase; historicalBackfill?: boolean },
    recentEmailMessages: EmailMessage[],
  ): Promise<ProcessInquiryEmailEventResult> {
    const idempotencyKey = `outbound-event:${input.emailMessage.id}:${OUTBOUND_EMAIL_EVENT_PROMPT_VERSION}`;
    const existing = await this.prisma.emailWorkflowDecision.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return {
        kind: 'outbound_event',
        workflowDecisionId: existing.id,
        workflowExecutionStatus: existing.executionStatus,
        skippedReason: 'workflow_event_already_processed',
      };
    }

    let result: AnalyzeOutboundEmailEventResult;
    try {
      result = await this.analyzeOutboundEmailEventUseCase.execute({
        emailMessage: input.emailMessage,
        inquiryCase: input.inquiryCase,
        recentEmailMessages,
      });
    } catch (error) {
      result = {
        success: false,
        errorCode: 'ai_validation_failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }

    const workflowDecisionId = `workflow_decision_${randomUUID()}`;
    if (!result.success) {
      await this.prisma.emailWorkflowDecision.create({
        data: {
          id: workflowDecisionId,
          emailMessageId: input.emailMessage.id,
          inquiryCaseId: input.inquiryCase.id,
          direction: input.emailMessage.direction,
          source: input.emailMessage.source,
          eventType: 'analysis_failed',
          responseExpected: false,
          commercialBoundaryDetected: false,
          humanReviewRequired: true,
          decisionSource: 'ai',
          modelName: process.env.AI_EMAIL_ANALYSIS_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
          promptVersion: OUTBOUND_EMAIL_EVENT_PROMPT_VERSION,
          rawResult: toJson({ errorCode: result.errorCode, message: result.message, rawOutput: result.rawOutput }),
          executionStatus: 'failed',
          executionFromStatus: input.inquiryCase.status,
          executionReason: result.message,
          executedAt: new Date(),
          idempotencyKey,
        },
      });
      return {
        kind: 'outbound_event',
        outboundAnalysisResult: result,
        workflowDecisionId,
        workflowExecutionStatus: 'failed',
      };
    }

    await this.prisma.emailWorkflowDecision.create({
      data: {
        id: workflowDecisionId,
        emailMessageId: input.emailMessage.id,
        inquiryCaseId: input.inquiryCase.id,
        direction: input.emailMessage.direction,
        source: input.emailMessage.source,
        eventType: result.analysis.eventType,
        responseExpected: result.analysis.responseExpected,
        suggestedStatus: result.analysis.suggestedStatus,
        confidence: result.analysis.confidence,
        riskLevel: result.analysis.riskLevel,
        reason: result.analysis.reason,
        commercialBoundaryDetected: result.analysis.commercialBoundaryDetected,
        humanReviewRequired: result.analysis.humanReviewRequired,
        decisionSource: 'ai',
        modelName: process.env.AI_EMAIL_ANALYSIS_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
        promptVersion: OUTBOUND_EMAIL_EVENT_PROMPT_VERSION,
        rawResult: toJson({ analysis: result.analysis, rawOutput: result.rawOutput, contextSnapshotId: result.contextSnapshotId }),
        idempotencyKey,
      },
    });
    const execution = await this.applyOutboundEmailEventUseCase.execute({
      workflowDecisionId,
      inquiryCaseId: input.inquiryCase.id,
      analysis: result.analysis,
      historicalBackfill: input.historicalBackfill,
    });
    if (execution.status === 'applied' && execution.toStatus) {
      input.inquiryCase.status = execution.toStatus;
    }

    return {
      kind: 'outbound_event',
      outboundAnalysisResult: result,
      workflowDecisionId,
      workflowExecutionStatus: execution.status,
    };
  }

  private async processInbound(
    input: { emailMessage: EmailMessage; inquiryCase: InquiryCase; historicalBackfill?: boolean },
    recentEmailMessages: EmailMessage[],
  ): Promise<ProcessInquiryEmailEventResult> {
    const recentOurReplies = recentEmailMessages.filter((message) => message.direction === EmailDirection.OUTBOUND);
    const aiAnalysisResult = await this.analyzeEmailWithAiUseCase.execute(input.emailMessage, {
      inquiryCase: input.inquiryCase,
      recentEmailMessages,
      recentOurReplies,
    });
    const aiDecisionId = await this.aiDecisionRepository.save({
      emailMessageId: input.emailMessage.id,
      inquiryCaseId: input.inquiryCase.id,
      result: aiAnalysisResult.success ? aiAnalysisResult.analysis : aiAnalysisResult,
      rawOutput: aiAnalysisResult.rawOutput,
    });
    if (!aiAnalysisResult.success) {
      return { kind: 'inbound_analysis', aiAnalysisResult };
    }
    if (input.historicalBackfill) {
      if (aiDecisionId) {
        await this.prisma.aiDecision.update({
          where: { id: aiDecisionId },
          data: {
            executionStatus: 'rejected',
            executionReason: 'Historical manual inbound email cannot change the current inquiry automatically.',
            executedAt: new Date(),
          },
        });
      }
      return {
        kind: 'inbound_analysis',
        aiAnalysisResult,
        skippedReason: 'historical_backfill_requires_manual_review',
      };
    }

    await this.updateCustomerStatusFromAiAnalysisUseCase.execute({
      customerEmail: input.inquiryCase.customerEmail,
      analysis: aiAnalysisResult.analysis,
    });
    await this.updateInquiryStructuredFactsFromAiUseCase.execute({
      inquiryCaseId: input.inquiryCase.id,
      emailMessageId: input.emailMessage.id,
      analysis: aiAnalysisResult.analysis,
    });
    await this.generateBusinessSubjectUseCase.execute({
      inquiryCaseId: input.inquiryCase.id,
      currentEmail: input.emailMessage,
      knownFacts: aiAnalysisResult.analysis.extractedRequirements,
    });

    let aiTransitionResult: ApplyAiSuggestedStatusResult | undefined;
    if (aiDecisionId) {
      aiTransitionResult = await this.applyAiSuggestedStatusUseCase.execute({
        aiDecisionId,
        inquiryCaseId: input.inquiryCase.id,
        analysis: aiAnalysisResult.analysis,
      });
      if (aiTransitionResult.status === 'applied') input.inquiryCase.status = aiTransitionResult.toStatus;
    }

    let replyDraftId: string | undefined;
    let replyDraftError: string | undefined;
    if (
      isEnabled(process.env.AI_REPLY_DRAFT_AUTO_GENERATE, true) &&
      [InquiryStatus.NEED_CLARIFICATION, InquiryStatus.NEED_ENGINEER_REVIEW]
        .includes(aiAnalysisResult.analysis.suggestedStatus)
    ) {
      try {
        const draft = await this.generateReplyDraftUseCase.execute({
          inquiryCaseId: input.inquiryCase.id,
          sourceEmailMessageId: input.emailMessage.id,
          aiDecisionId,
          targetStatus: aiAnalysisResult.analysis.suggestedStatus,
        });
        replyDraftId = draft.id;
      } catch (error) {
        replyDraftError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      kind: 'inbound_analysis',
      aiAnalysisResult,
      aiTransitionResult,
      replyDraftId,
      replyDraftError,
    };
  }

  private async listInquiryEmailMessages(inquiryCaseId: string, through: Date): Promise<EmailMessage[]> {
    const links = await this.inquiryMessageRepository.listByInquiryCaseId(inquiryCaseId);
    const messages = await Promise.all(links.map((link) => this.emailMessageRepository.findById(link.emailMessageId)));
    return messages
      .filter((message): message is EmailMessage => Boolean(message))
      .filter((message) => message.receivedAt.getTime() <= through.getTime())
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }
}

function isEnabled(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function toJson(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}
