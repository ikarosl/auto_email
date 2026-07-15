import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../../common/database/prisma.service.js';
import { InquiryMessageRepository } from '../../../inquiry/application/ports/inquiry-message.repository.js';
import { ApplyInquiryStateDecisionUseCase } from '../../../inquiry/application/use-cases/apply-inquiry-state-decision.use-case.js';
import { GenerateBusinessSubjectUseCase } from '../../../inquiry/application/use-cases/generate-business-subject.use-case.js';
import { UpdateCustomerStatusFromAiAnalysisUseCase } from '../../../inquiry/application/use-cases/update-customer-status-from-ai-analysis.use-case.js';
import { UpdateInquiryStructuredFactsFromAiUseCase } from '../../../inquiry/application/use-cases/update-inquiry-structured-facts-from-ai.use-case.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { InquiryBusinessEventType } from '../../../inquiry/domain/enums/inquiry-business-event.enum.js';
import {
  InquiryActionOwner,
  InquiryBusinessStage,
  INITIAL_INQUIRY_STATE,
  InquiryLifecycleStatus,
} from '../../../inquiry/domain/enums/inquiry-state.enum.js';
import {
  INQUIRY_STATE_POLICY_VERSION,
  reduceInquiryState,
} from '../../../inquiry/domain/services/inquiry-state-reducer.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import type { EmailAiAnalysis } from '../../domain/value-objects/email-ai-analysis.vo.js';
import { EmailMessageRepository } from '../ports/email-message.repository.js';
import { EMAIL_ANALYSIS_PROMPT_VERSION } from '../prompts/email-analysis.prompt.js';
import { AnalyzeEmailWithAiResult, AnalyzeEmailWithAiUseCase } from './analyze-email-with-ai.use-case.js';
import { GenerateReplyDraftUseCase } from './generate-reply-draft.use-case.js';

export interface ProcessInquiryEmailEventResult {
  kind: 'email_analysis' | 'deterministic_send';
  analysisResult?: AnalyzeEmailWithAiResult;
  analysisDecisionId?: string;
  stateDecisionId?: string;
  stateExecutionStatus?: string;
  replyDraftId?: string;
  replyDraftError?: string;
  skippedReason?: string;
  reductionExecutionStatus?: string;
  simulatedState?: {
    businessStage: InquiryBusinessStage;
    actionOwner: InquiryActionOwner;
    lifecycleStatus: InquiryLifecycleStatus;
  };
}

export class ProcessInquiryEmailEventUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyzeEmailWithAiUseCase: AnalyzeEmailWithAiUseCase,
    private readonly applyStateDecisionUseCase: ApplyInquiryStateDecisionUseCase,
    private readonly inquiryMessageRepository: InquiryMessageRepository,
    private readonly emailMessageRepository: EmailMessageRepository,
    private readonly updateCustomerStatusFromAiAnalysisUseCase: UpdateCustomerStatusFromAiAnalysisUseCase,
    private readonly updateInquiryStructuredFactsFromAiUseCase: UpdateInquiryStructuredFactsFromAiUseCase,
    private readonly generateBusinessSubjectUseCase: GenerateBusinessSubjectUseCase,
    private readonly generateReplyDraftUseCase: GenerateReplyDraftUseCase,
  ) {}

  async execute(input: {
    emailMessage: EmailMessage;
    inquiryCase: InquiryCase;
    historicalBackfill?: boolean;
    baselineIncomplete?: boolean;
    replayRunId?: string;
    suppressReplyDraft?: boolean;
    bypassProcessingMode?: boolean;
    bypassScopeGuard?: boolean;
    simulationOnly?: boolean;
    stateOverride?: InquiryCase;
    recentEmailMessagesOverride?: EmailMessage[];
  }): Promise<ProcessInquiryEmailEventResult> {
    if (
      input.emailMessage.direction === EmailDirection.OUTBOUND
      && [EmailSource.SMTP, EmailSource.SIMULATED_SEND].includes(input.emailMessage.source)
    ) {
      return {
        kind: 'deterministic_send',
        skippedReason: 'system_send_event_is_recorded_by_send_workflow',
      };
    }

    if (input.inquiryCase.processingMode === 'manual' && !input.bypassProcessingMode) {
      return {
        kind: 'email_analysis',
        stateExecutionStatus: 'manual_mode',
        skippedReason: 'inquiry_manual_processing_mode',
      };
    }

    if (!isEnabled(process.env.AI_EMAIL_ANALYSIS_ENABLED, true)) {
      return {
        kind: 'email_analysis',
        skippedReason: 'email_analysis_disabled',
      };
    }

    const idempotencyKey = input.replayRunId
      ? `email-analysis:${input.inquiryCase.id}:${input.emailMessage.id}:${EMAIL_ANALYSIS_PROMPT_VERSION}:${input.replayRunId}`
      : `email-analysis:${input.inquiryCase.id}:${input.emailMessage.id}:${EMAIL_ANALYSIS_PROMPT_VERSION}`;
    const existing = await this.prisma.emailAnalysisDecision.findUnique({ where: { idempotencyKey } });
    if (existing) {
      const stateDecision = await this.prisma.inquiryStateDecision.findUnique({
        where: { analysisDecisionId: existing.id },
      });
      return {
        kind: 'email_analysis',
        analysisDecisionId: existing.id,
        stateDecisionId: stateDecision?.id,
        stateExecutionStatus: stateDecision?.executionStatus,
        skippedReason: 'email_analysis_already_processed',
      };
    }

    const analysisInquiryCase = input.stateOverride ?? (input.historicalBackfill
      ? await this.resolveHistoricalInquiryCase(input.inquiryCase, input.emailMessage.receivedAt)
      : input.inquiryCase);
    const recentEmailMessages = input.recentEmailMessagesOverride ?? await this.listInquiryEmailMessages(
      input.inquiryCase.id,
      input.emailMessage.receivedAt,
    );
    const analysisResult = await this.analyzeEmailWithAiUseCase.execute(input.emailMessage, {
      inquiryCase: analysisInquiryCase,
      recentEmailMessages,
      recentOurReplies: recentEmailMessages.filter((message) => message.direction === EmailDirection.OUTBOUND),
    });
    const analysisDecisionId = `email_analysis_${randomUUID()}`;

    if (!analysisResult.success) {
      await this.prisma.emailAnalysisDecision.create({
        data: {
          id: analysisDecisionId,
          emailMessageId: input.emailMessage.id,
          inquiryCaseId: input.inquiryCase.id,
          contextSnapshotId: analysisResult.contextSnapshotId ?? null,
          direction: input.emailMessage.direction,
          replayRunId: input.replayRunId ?? null,
          isEffective: !input.simulationOnly,
          rawResult: toJson({ errorCode: analysisResult.errorCode, message: analysisResult.message }),
          rawOutput: analysisResult.rawOutput ?? null,
          modelName: modelName(),
          promptVersion: EMAIL_ANALYSIS_PROMPT_VERSION,
          success: false,
          errorCode: analysisResult.errorCode,
          errorMessage: analysisResult.message,
          idempotencyKey,
        },
      });
      return { kind: 'email_analysis', analysisResult, analysisDecisionId };
    }

    const analysis = analysisResult.analysis;
    await this.prisma.emailAnalysisDecision.create({
        data: {
          id: analysisDecisionId,
          emailMessageId: input.emailMessage.id,
          inquiryCaseId: input.inquiryCase.id,
          contextSnapshotId: analysisResult.contextSnapshotId ?? null,
          direction: input.emailMessage.direction,
          isInquiry: analysis.isInquiry,
          messageClassification: analysis.messageClassification,
          inquiryScope: analysis.inquiryScope.type,
          scopeRelationship: analysis.inquiryScope.relationshipToExistingInquiry,
          inquiryScopeConfidence: analysis.inquiryScope.confidence,
          detectedProducts: analysis.inquiryScope.detectedProducts,
          replayRunId: input.replayRunId ?? null,
          isEffective: !input.simulationOnly,
          suggestedBusinessStage: analysis.suggestedState.businessStage,
          suggestedActionOwner: analysis.suggestedState.actionOwner,
          suggestedLifecycleStatus: analysis.suggestedState.lifecycleStatus,
          confidence: analysis.confidence,
          riskLevel: analysis.riskLevel,
          reason: analysis.reason,
          missingFields: analysis.missingFields,
          extractedRequirements: analysis.extractedRequirements,
          quoteBoundaryDetected: analysis.quoteBoundaryDetected,
          humanReviewRequired: analysis.humanReviewRequired,
          nextAction: analysis.nextAction,
          rawResult: toJson(analysis),
          rawOutput: analysisResult.rawOutput,
          modelName: modelName(),
          promptVersion: EMAIL_ANALYSIS_PROMPT_VERSION,
          success: true,
          idempotencyKey,
        },
      });

    if (this.shouldEnterManualMode(input, analysis)) {
      await this.enterManualMode(input, analysisDecisionId, analysis);
      input.inquiryCase.processingMode = 'manual';
      input.inquiryCase.processingModeReason = 'multiple_products';
      return {
        kind: 'email_analysis',
        analysisResult,
        analysisDecisionId,
        stateExecutionStatus: 'manual_mode',
        skippedReason: 'multiple_products_manual_mode',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, event] of analysis.events.entries()) {
        await tx.inquiryBusinessEvent.create({
          data: {
            id: `business_event_${randomUUID()}`,
            inquiryCaseId: input.inquiryCase.id,
            emailMessageId: input.emailMessage.id,
            analysisDecisionId,
            eventType: event.eventType,
            actor: event.actor,
            sequenceInEmail: index,
            confidence: event.confidence,
            evidence: event.evidence,
            payloadJson: toJson(event.payload),
            sourceType: 'ai',
            replayRunId: input.replayRunId ?? null,
            isEffective: !input.simulationOnly,
            occurredAt: input.emailMessage.receivedAt,
          },
        });
      }
    });

    const reduction = reduceInquiryState({
      current: analysisInquiryCase,
      suggested: analysis.suggestedState,
      events: analysis.events.map((event) => ({
        eventType: event.eventType as InquiryBusinessEventType,
        confidence: event.confidence,
      })),
      messageClassification: analysis.messageClassification,
      confidence: analysis.confidence,
      riskLevel: analysis.riskLevel,
      minimumConfidence: readMinimumConfidence(),
      historicalBackfill: input.historicalBackfill,
    });
    const stateDecisionId = `state_decision_${randomUUID()}`;
    const configuredExecutionStatus = input.simulationOnly
      ? 'replay_simulated'
      : resolveConfiguredExecutionStatus(reduction.executionStatus);
    await this.prisma.inquiryStateDecision.create({
      data: {
        id: stateDecisionId,
        inquiryCaseId: input.inquiryCase.id,
        emailMessageId: input.emailMessage.id,
        analysisDecisionId,
        replayRunId: input.replayRunId ?? null,
        isEffective: !input.simulationOnly,
        beforeBusinessStage: analysisInquiryCase.businessStage,
        beforeActionOwner: analysisInquiryCase.actionOwner,
        beforeLifecycleStatus: analysisInquiryCase.lifecycleStatus,
        beforeStateVersion: analysisInquiryCase.stateVersion,
        suggestedBusinessStage: reduction.suggested.businessStage,
        suggestedActionOwner: reduction.suggested.actionOwner,
        suggestedLifecycleStatus: reduction.suggested.lifecycleStatus,
        appliedBusinessStage: input.simulationOnly ? reduction.safeState.businessStage : null,
        appliedActionOwner: input.simulationOnly ? reduction.safeState.actionOwner : null,
        appliedLifecycleStatus: input.simulationOnly ? reduction.safeState.lifecycleStatus : null,
        confidence: analysis.confidence,
        riskLevel: analysis.riskLevel,
        eventValidationPassed: reduction.eventValidationPassed,
        humanReviewAdvisory: analysis.humanReviewRequired,
        baselineIncomplete: input.baselineIncomplete ?? false,
        executionStatus: configuredExecutionStatus,
        executionReason: reduction.reason,
        policyVersion: INQUIRY_STATE_POLICY_VERSION,
        decisionSource: 'ai',
        eventOccurredAt: input.emailMessage.receivedAt,
      },
    });

    if (input.simulationOnly) {
      return {
        kind: 'email_analysis',
        analysisResult,
        analysisDecisionId,
        stateDecisionId,
        stateExecutionStatus: configuredExecutionStatus,
        reductionExecutionStatus: reduction.executionStatus,
        simulatedState: reduction.safeState,
      };
    }

    let executionStatus = configuredExecutionStatus;
    if (configuredExecutionStatus === 'pending') {
      const applied = await this.applyStateDecisionUseCase.applyAutomatic(
        stateDecisionId,
        reduction.safeState,
        reduction.pendingLifecycleStatus,
      );
      executionStatus = applied.executionStatus;
      input.inquiryCase.businessStage = applied.appliedBusinessStage ?? input.inquiryCase.businessStage;
      input.inquiryCase.actionOwner = applied.appliedActionOwner ?? input.inquiryCase.actionOwner;
      input.inquiryCase.lifecycleStatus = applied.appliedLifecycleStatus ?? input.inquiryCase.lifecycleStatus;
      if (['applied', 'partially_applied'].includes(applied.executionStatus)) {
        input.inquiryCase.stateVersion += 1;
      }
    }

    if (input.emailMessage.direction === EmailDirection.INBOUND && !input.historicalBackfill) {
      await this.updateCustomerStatusFromAiAnalysisUseCase.execute({
        customerEmail: input.inquiryCase.customerEmail,
        analysis,
      });
      await this.updateInquiryStructuredFactsFromAiUseCase.execute({
        inquiryCaseId: input.inquiryCase.id,
        emailMessageId: input.emailMessage.id,
        analysis,
      });
      await this.generateBusinessSubjectUseCase.execute({
        inquiryCaseId: input.inquiryCase.id,
        currentEmail: input.emailMessage,
        knownFacts: analysis.extractedRequirements,
      });
    }

    const draftResult = input.suppressReplyDraft
      ? {}
      : await this.maybeGenerateReplyDraft(input, analysisDecisionId);
    return {
      kind: 'email_analysis',
      analysisResult,
      analysisDecisionId,
      stateDecisionId,
      stateExecutionStatus: executionStatus,
      ...draftResult,
    };
  }

  private shouldEnterManualMode(
    input: {
      emailMessage: EmailMessage;
      inquiryCase: InquiryCase;
      bypassScopeGuard?: boolean;
    },
    analysis: EmailAiAnalysis,
  ): boolean {
    return !input.bypassScopeGuard
      && input.inquiryCase.processingMode === 'automatic'
      && input.emailMessage.direction === EmailDirection.INBOUND
      && analysis.isInquiry
      && ['customer_inquiry', 'customer_follow_up'].includes(analysis.messageClassification)
      && (
        analysis.inquiryScope.type === 'multiple_products'
        || ['additional_independent_requirement', 'separate_new_inquiry']
          .includes(analysis.inquiryScope.relationshipToExistingInquiry)
      )
      && analysis.inquiryScope.confidence >= readMinimumConfidence();
  }

  private async enterManualMode(
    input: { emailMessage: EmailMessage; inquiryCase: InquiryCase },
    analysisDecisionId: string,
    analysis: EmailAiAnalysis,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.inquiryCase.updateMany({
        where: { id: input.inquiryCase.id, processingMode: 'automatic' },
        data: {
          processingMode: 'manual',
          processingModeReason: 'multiple_products',
          processingModeChangedAt: now,
          processingModeChangedBy: analysisDecisionId,
          updatedAt: now,
        },
      });
      if (changed.count !== 1) return;

      await tx.inquiryProcessingModeTransition.create({
        data: {
          id: `processing_mode_transition_${randomUUID()}`,
          inquiryCaseId: input.inquiryCase.id,
          fromMode: 'automatic',
          toMode: 'manual',
          reason: analysis.inquiryScope.relationshipToExistingInquiry === 'additional_independent_requirement'
            ? 'AI detected an additional independent product requirement during the inquiry.'
            : analysis.inquiryScope.relationshipToExistingInquiry === 'separate_new_inquiry'
              ? 'AI detected a separate new inquiry inside the matched email thread.'
              : 'AI detected multiple independent product requirements.',
          sourceEmailMessageId: input.emailMessage.id,
          analysisDecisionId,
          inquiryScope: analysis.inquiryScope.type,
          scopeRelationship: analysis.inquiryScope.relationshipToExistingInquiry,
          scopeConfidence: analysis.inquiryScope.confidence,
          detectedProducts: analysis.inquiryScope.detectedProducts,
          beforeStateJson: {
            businessStage: input.inquiryCase.businessStage,
            actionOwner: input.inquiryCase.actionOwner,
            lifecycleStatus: input.inquiryCase.lifecycleStatus,
            stateVersion: input.inquiryCase.stateVersion,
          },
          changedBy: analysisDecisionId,
          changedByType: 'ai',
          changedAt: now,
        },
      });
      await tx.replyDraft.updateMany({
        where: {
          inquiryCaseId: input.inquiryCase.id,
          status: { in: ['pending_review', 'approved', 'rejected'] },
        },
        data: { status: 'expired', updatedAt: now },
      });
    });
  }

  private async maybeGenerateReplyDraft(
    input: { emailMessage: EmailMessage; inquiryCase: InquiryCase; historicalBackfill?: boolean },
    analysisDecisionId: string,
  ): Promise<Pick<ProcessInquiryEmailEventResult, 'replyDraftId' | 'replyDraftError'>> {
    if (
      input.historicalBackfill
      || input.emailMessage.direction !== EmailDirection.INBOUND
      || !isEnabled(process.env.AI_REPLY_DRAFT_AUTO_GENERATE, true)
      || input.inquiryCase.lifecycleStatus !== InquiryLifecycleStatus.ACTIVE
      || input.inquiryCase.actionOwner !== InquiryActionOwner.US
      || !(
        input.inquiryCase.businessStage === InquiryBusinessStage.INTAKE
        || input.inquiryCase.businessStage === InquiryBusinessStage.TECHNICAL_REVIEW
      )
    ) return {};

    try {
      const draft = await this.generateReplyDraftUseCase.execute({
        inquiryCaseId: input.inquiryCase.id,
        sourceEmailMessageId: input.emailMessage.id,
        emailAnalysisDecisionId: analysisDecisionId,
      });
      return { replyDraftId: draft.id };
    } catch (error) {
      return { replyDraftError: error instanceof Error ? error.message : String(error) };
    }
  }

  private async listInquiryEmailMessages(inquiryCaseId: string, through: Date): Promise<EmailMessage[]> {
    const links = await this.inquiryMessageRepository.listByInquiryCaseId(inquiryCaseId);
    const messages = await Promise.all(links.map((link) => this.emailMessageRepository.findById(link.emailMessageId)));
    return messages
      .filter((message): message is EmailMessage => Boolean(message))
      .filter((message) => message.receivedAt.getTime() <= through.getTime())
      .sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime()
        || left.id.localeCompare(right.id));
  }

  private async resolveHistoricalInquiryCase(inquiryCase: InquiryCase, through: Date): Promise<InquiryCase> {
    const latestTransition = await this.prisma.inquiryStateTransition.findFirst({
      where: {
        inquiryCaseId: inquiryCase.id,
        eventOccurredAt: { lte: through },
      },
      include: {
        stateDecision: { select: { beforeStateVersion: true } },
      },
      orderBy: [
        { eventOccurredAt: 'desc' },
        { processedAt: 'desc' },
        { id: 'desc' },
      ],
    });

    return {
      ...inquiryCase,
      businessSubject: undefined,
      businessSubjectSource: undefined,
      businessSubjectUpdatedAt: undefined,
      businessStage: latestTransition?.toBusinessStage ?? INITIAL_INQUIRY_STATE.businessStage,
      actionOwner: latestTransition?.toActionOwner ?? INITIAL_INQUIRY_STATE.actionOwner,
      lifecycleStatus: latestTransition?.toLifecycleStatus ?? INITIAL_INQUIRY_STATE.lifecycleStatus,
      stateVersion: latestTransition ? latestTransition.stateDecision.beforeStateVersion + 1 : 0,
      latestMessageAt: through,
    };
  }
}

function readMinimumConfidence(): number {
  const parsed = Number(process.env.AI_STATUS_TRANSITION_MIN_CONFIDENCE ?? 0.9);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.9;
}

function modelName(): string {
  return process.env.AI_EMAIL_ANALYSIS_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
}

function isEnabled(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function resolveConfiguredExecutionStatus(reducerStatus: string): string {
  if (reducerStatus !== 'eligible') return reducerStatus;
  if (!isEnabled(process.env.AI_STATUS_TRANSITION_ENABLED, false)) return 'disabled';
  if (isEnabled(process.env.AI_STATUS_TRANSITION_DRY_RUN, true)) return 'dry_run';
  return 'pending';
}

function toJson(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}
