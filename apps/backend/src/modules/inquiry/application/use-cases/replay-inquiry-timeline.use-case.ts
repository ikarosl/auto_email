import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../../common/database/prisma.service.js';
import { ProcessInquiryEmailEventUseCase } from '../../../email/application/use-cases/process-inquiry-email-event.use-case.js';
import type { EmailMessage } from '../../../email/domain/entities/email-message.entity.js';
import type { EmailAiAnalysis } from '../../../email/domain/value-objects/email-ai-analysis.vo.js';
import type { EmailMessageRepository } from '../../../email/application/ports/email-message.repository.js';
import type { InquiryMessageRepository } from '../ports/inquiry-message.repository.js';
import type { InquiryRepository } from '../ports/inquiry.repository.js';
import type { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';
import {
  InquiryActionOwner,
  InquiryBusinessStage,
  InquiryLifecycleStatus,
} from '../../domain/enums/inquiry-state.enum.js';

interface ReplayState {
  businessStage: InquiryBusinessStage;
  actionOwner: InquiryActionOwner;
  lifecycleStatus: InquiryLifecycleStatus;
  stateVersion: number;
}

interface ReplayTimelineEntry {
  kind: 'email' | 'human_correction' | 'deterministic_send';
  occurredAt: string;
  emailMessageId?: string;
  stateDecisionId?: string;
  beforeState: ReplayState;
  afterState: ReplayState;
  executionStatus: string;
}

export class ReplayInquiryTimelineUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inquiryRepository: InquiryRepository,
    private readonly inquiryMessageRepository: InquiryMessageRepository,
    private readonly emailMessageRepository: EmailMessageRepository,
    private readonly processInquiryEmailEventUseCase: ProcessInquiryEmailEventUseCase,
  ) {}

  async execute(input: { inquiryCaseId: string; initiatedBy: string; triggerType: string }) {
    const inquiry = await this.inquiryRepository.findById(input.inquiryCaseId);
    if (!inquiry) throw new Error(`Inquiry not found: ${input.inquiryCaseId}`);
    if (inquiry.processingMode !== 'manual') {
      throw new Error('Only a manual inquiry can be replayed and restored to automatic mode.');
    }

    const modeTransition = await this.prisma.inquiryProcessingModeTransition.findFirst({
      where: { inquiryCaseId: inquiry.id, fromMode: 'automatic', toMode: 'manual' },
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
    });
    if (!modeTransition) throw new Error('The manual-mode baseline is missing.');

    const sourceEmail = modeTransition.sourceEmailMessageId
      ? await this.emailMessageRepository.findById(modeTransition.sourceEmailMessageId)
      : undefined;
    const fromTime = sourceEmail?.receivedAt ?? modeTransition.changedAt;
    const throughTime = new Date();
    const baseline = parseReplayState(modeTransition.beforeStateJson, inquiry.stateVersion);
    const runId = `inquiry_replay_${randomUUID()}`;

    await this.prisma.inquiryReplayRun.create({
      data: {
        id: runId,
        inquiryCaseId: inquiry.id,
        triggerType: input.triggerType,
        status: 'running',
        fromTime,
        throughTime,
        expectedStateVersion: inquiry.stateVersion,
        baselineStateJson: toJson(baseline),
        initiatedBy: input.initiatedBy,
      },
    });

    try {
      const allMessages = await this.listMessages(inquiry.id, throughTime);
      const replayMessages = orderMessagesForReplay(
        allMessages.filter((message) => message.receivedAt >= fromTime),
      );
      const humanTransitions = await this.prisma.inquiryStateTransition.findMany({
        where: {
          inquiryCaseId: inquiry.id,
          changedByType: 'human',
          eventOccurredAt: { gte: fromTime, lte: throughTime },
          isEffective: true,
        },
        orderBy: [{ eventOccurredAt: 'asc' }, { processedAt: 'asc' }, { id: 'asc' }],
      });

      const timeline: ReplayTimelineEntry[] = [];
      const successfulInboundAnalyses: Array<{ emailMessageId: string; analysis: EmailAiAnalysis }> = [];
      let current = baseline;
      let transitionCount = 0;
      const merged = mergeReplayItems(replayMessages, humanTransitions);

      for (const item of merged) {
        if (item.kind === 'human_correction') {
          const before = current;
          current = {
            businessStage: item.transition.toBusinessStage,
            actionOwner: item.transition.toActionOwner,
            lifecycleStatus: item.transition.toLifecycleStatus,
            stateVersion: current.stateVersion + 1,
          };
          timeline.push({
            kind: 'human_correction',
            occurredAt: item.transition.eventOccurredAt.toISOString(),
            beforeState: before,
            afterState: current,
            executionStatus: 'preserved_human_correction',
          });
          continue;
        }

        const message = item.message;
        const before = current;
        const stateOverride: InquiryCase = {
          ...inquiry,
          ...current,
          processingMode: 'manual',
          latestMessageAt: message.receivedAt,
        };
        const result = await this.processInquiryEmailEventUseCase.execute({
          emailMessage: message,
          inquiryCase: inquiry,
          replayRunId: runId,
          suppressReplyDraft: true,
          bypassProcessingMode: true,
          bypassScopeGuard: true,
          simulationOnly: true,
          stateOverride,
          recentEmailMessagesOverride: allMessages.filter(
            (candidate) => candidate.receivedAt.getTime() <= message.receivedAt.getTime(),
          ),
        });

        if (result.kind === 'deterministic_send') {
          timeline.push({
            kind: 'deterministic_send',
            occurredAt: message.receivedAt.toISOString(),
            emailMessageId: message.id,
            beforeState: before,
            afterState: before,
            executionStatus: 'no_change',
          });
          continue;
        }
        if (!result.analysisResult?.success || !result.simulatedState || !result.stateDecisionId) {
          return this.finishWithoutApply(runId, 'failed', timeline, 'Replay analysis failed.');
        }
        if (result.reductionExecutionStatus === 'pending_review') {
          timeline.push({
            kind: 'email',
            occurredAt: message.receivedAt.toISOString(),
            emailMessageId: message.id,
            stateDecisionId: result.stateDecisionId,
            beforeState: before,
            afterState: before,
            executionStatus: 'pending_review',
          });
          return this.finishWithoutApply(
            runId,
            'pending_review',
            timeline,
            'At least one replayed email requires human state review.',
          );
        }

        const changed = !statesEqual(before, result.simulatedState);
        current = {
          ...result.simulatedState,
          stateVersion: before.stateVersion + (changed ? 1 : 0),
        };
        if (changed) {
          transitionCount += 1;
          await this.prisma.inquiryStateTransition.create({
            data: {
              id: `state_transition_${randomUUID()}`,
              inquiryCaseId: inquiry.id,
              stateDecisionId: result.stateDecisionId,
              replayRunId: runId,
              isEffective: false,
              fromBusinessStage: before.businessStage,
              fromActionOwner: before.actionOwner,
              fromLifecycleStatus: before.lifecycleStatus,
              toBusinessStage: current.businessStage,
              toActionOwner: current.actionOwner,
              toLifecycleStatus: current.lifecycleStatus,
              changedDimensionsJson: changedDimensions(before, current),
              reason: 'Inquiry timeline replay.',
              changedBy: runId,
              changedByType: 'replay',
              eventOccurredAt: message.receivedAt,
              processedAt: new Date(),
            },
          });
        }
        if (message.direction === 'inbound') {
          successfulInboundAnalyses.push({
            emailMessageId: message.id,
            analysis: result.analysisResult.analysis,
          });
        }
        timeline.push({
          kind: 'email',
          occurredAt: message.receivedAt.toISOString(),
          emailMessageId: message.id,
          stateDecisionId: result.stateDecisionId,
          beforeState: before,
          afterState: current,
          executionStatus: changed ? 'replay_applied' : 'replay_no_change',
        });
      }

      const completed = await this.commitReplay({
        runId,
        inquiry,
        fromTime,
        throughTime,
        finalState: current,
        transitionCount,
        timeline,
        analyses: successfulInboundAnalyses,
        initiatedBy: input.initiatedBy,
      });
      return completed;
    } catch (error) {
      return this.finishWithoutApply(
        runId,
        'failed',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async listMessages(inquiryCaseId: string, throughTime: Date): Promise<EmailMessage[]> {
    const links = await this.inquiryMessageRepository.listByInquiryCaseId(inquiryCaseId);
    const messages = await Promise.all(links.map((link) => this.emailMessageRepository.findById(link.emailMessageId)));
    return messages
      .filter((message): message is EmailMessage => Boolean(message && message.receivedAt <= throughTime))
      .sort(compareMessages);
  }

  private async finishWithoutApply(
    runId: string,
    status: 'failed' | 'pending_review' | 'conflict',
    timeline: ReplayTimelineEntry[],
    errorMessage: string,
  ) {
    return this.prisma.inquiryReplayRun.update({
      where: { id: runId },
      data: {
        status,
        timelineJson: toJson(timeline),
        errorMessage,
        completedAt: new Date(),
      },
    });
  }

  private async commitReplay(input: {
    runId: string;
    inquiry: InquiryCase;
    fromTime: Date;
    throughTime: Date;
    finalState: ReplayState;
    transitionCount: number;
    timeline: ReplayTimelineEntry[];
    analyses: Array<{ emailMessageId: string; analysis: EmailAiAnalysis }>;
    initiatedBy: string;
  }) {
    const facts = buildFacts(input.analyses);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.inquiryCase.updateMany({
        where: {
          id: input.inquiry.id,
          processingMode: 'manual',
          stateVersion: input.inquiry.stateVersion,
        },
        data: {
          businessStage: input.finalState.businessStage,
          actionOwner: input.finalState.actionOwner,
          lifecycleStatus: input.finalState.lifecycleStatus,
          stateVersion: input.inquiry.stateVersion + input.transitionCount,
          processingMode: 'automatic',
          processingModeReason: null,
          processingModeChangedAt: now,
          processingModeChangedBy: input.initiatedBy,
          closedAt: input.finalState.lifecycleStatus === 'active' ? null : now,
          updatedAt: now,
        },
      });
      if (changed.count !== 1) {
        await tx.inquiryReplayRun.update({
          where: { id: input.runId },
          data: {
            status: 'conflict',
            timelineJson: toJson(input.timeline),
            errorMessage: 'Inquiry state or processing mode changed during replay.',
            completedAt: now,
          },
        });
        return tx.inquiryReplayRun.findUniqueOrThrow({ where: { id: input.runId } });
      }

      await tx.emailAnalysisDecision.updateMany({
        where: {
          inquiryCaseId: input.inquiry.id,
          replayRunId: null,
          createdAt: { gte: input.fromTime },
        },
        data: { isEffective: false },
      });
      await tx.inquiryBusinessEvent.updateMany({
        where: {
          inquiryCaseId: input.inquiry.id,
          sourceType: { not: 'human' },
          occurredAt: { gte: input.fromTime, lte: input.throughTime },
        },
        data: { isEffective: false },
      });
      await tx.inquiryStateDecision.updateMany({
        where: {
          inquiryCaseId: input.inquiry.id,
          replayRunId: null,
          decisionSource: { not: 'human' },
          eventOccurredAt: { gte: input.fromTime, lte: input.throughTime },
        },
        data: { isEffective: false },
      });
      await tx.inquiryStateTransition.updateMany({
        where: {
          inquiryCaseId: input.inquiry.id,
          replayRunId: null,
          changedByType: { not: 'human' },
          eventOccurredAt: { gte: input.fromTime, lte: input.throughTime },
        },
        data: { isEffective: false },
      });
      await tx.emailAnalysisDecision.updateMany({
        where: { replayRunId: input.runId },
        data: { isEffective: true },
      });
      await tx.inquiryBusinessEvent.updateMany({
        where: { replayRunId: input.runId },
        data: { isEffective: true },
      });
      await tx.inquiryStateDecision.updateMany({
        where: { replayRunId: input.runId },
        data: { isEffective: true, executionStatus: 'replay_applied', executedAt: now, updatedAt: now },
      });
      await tx.inquiryStateTransition.updateMany({
        where: { replayRunId: input.runId },
        data: { isEffective: true },
      });

      await tx.inquiryStructuredFact.deleteMany({ where: { inquiryCaseId: input.inquiry.id } });
      if (facts) {
        await tx.inquiryStructuredFact.create({ data: { inquiryCaseId: input.inquiry.id, ...facts, updatedAt: now } });
      }
      await tx.inquiryContextSummary.deleteMany({ where: { inquiryCaseId: input.inquiry.id } });
      await tx.replyDraft.updateMany({
        where: { inquiryCaseId: input.inquiry.id, status: { in: ['pending_review', 'approved', 'rejected'] } },
        data: { status: 'expired', updatedAt: now },
      });
      await tx.inquiryProcessingModeTransition.create({
        data: {
          id: `processing_mode_transition_${randomUUID()}`,
          inquiryCaseId: input.inquiry.id,
          fromMode: 'manual',
          toMode: 'automatic',
          reason: 'Administrator dismissed the multiple-product detection after successful timeline replay.',
          beforeStateJson: {
            businessStage: input.inquiry.businessStage,
            actionOwner: input.inquiry.actionOwner,
            lifecycleStatus: input.inquiry.lifecycleStatus,
            stateVersion: input.inquiry.stateVersion,
          },
          changedBy: input.initiatedBy,
          changedByType: 'human',
          changedAt: now,
        },
      });
      return tx.inquiryReplayRun.update({
        where: { id: input.runId },
        data: {
          status: 'completed',
          finalStateJson: toJson(input.finalState),
          timelineJson: toJson(input.timeline),
          completedAt: now,
        },
      });
    });
  }
}

function parseReplayState(value: unknown, fallbackVersion: number): ReplayState {
  const state = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    businessStage: Object.values(InquiryBusinessStage).includes(state.businessStage as InquiryBusinessStage)
      ? state.businessStage as InquiryBusinessStage
      : InquiryBusinessStage.INTAKE,
    actionOwner: Object.values(InquiryActionOwner).includes(state.actionOwner as InquiryActionOwner)
      ? state.actionOwner as InquiryActionOwner
      : InquiryActionOwner.US,
    lifecycleStatus: Object.values(InquiryLifecycleStatus).includes(state.lifecycleStatus as InquiryLifecycleStatus)
      ? state.lifecycleStatus as InquiryLifecycleStatus
      : InquiryLifecycleStatus.ACTIVE,
    stateVersion: typeof state.stateVersion === 'number' ? state.stateVersion : fallbackVersion,
  };
}

function orderMessagesForReplay(messages: EmailMessage[]): EmailMessage[] {
  const remaining = [...messages].sort(compareMessages);
  const byMessageId = new Map(
    remaining
      .filter((message) => message.externalMessageId)
      .map((message) => [normalizeMessageId(message.externalMessageId!), message]),
  );
  const emitted = new Set<string>();
  const ordered: EmailMessage[] = [];
  while (remaining.length > 0) {
    const index = remaining.findIndex((message) => {
      const parentId = message.inReplyTo ? normalizeMessageId(message.inReplyTo) : undefined;
      const parent = parentId ? byMessageId.get(parentId) : undefined;
      return !parent || emitted.has(parent.id);
    });
    const [next] = remaining.splice(index >= 0 ? index : 0, 1);
    ordered.push(next!);
    emitted.add(next!.id);
  }
  return ordered;
}

function mergeReplayItems(messages: EmailMessage[], transitions: any[]) {
  return [
    ...messages.map((message) => ({ kind: 'email' as const, at: message.receivedAt, message })),
    ...transitions.map((transition) => ({
      kind: 'human_correction' as const,
      at: transition.eventOccurredAt as Date,
      transition,
    })),
  ].sort((left, right) => left.at.getTime() - right.at.getTime()
    || (left.kind === 'human_correction' ? 1 : -1));
}

function compareMessages(left: EmailMessage, right: EmailMessage): number {
  return left.receivedAt.getTime() - right.receivedAt.getTime() || left.id.localeCompare(right.id);
}

function normalizeMessageId(value: string): string {
  return value.trim().replace(/^<|>$/g, '').toLowerCase();
}

function statesEqual(left: ReplayState, right: Omit<ReplayState, 'stateVersion'>): boolean {
  return left.businessStage === right.businessStage
    && left.actionOwner === right.actionOwner
    && left.lifecycleStatus === right.lifecycleStatus;
}

function changedDimensions(left: ReplayState, right: ReplayState): string[] {
  const result: string[] = [];
  if (left.businessStage !== right.businessStage) result.push('businessStage');
  if (left.actionOwner !== right.actionOwner) result.push('actionOwner');
  if (left.lifecycleStatus !== right.lifecycleStatus) result.push('lifecycleStatus');
  return result;
}

function buildFacts(entries: Array<{ emailMessageId: string; analysis: EmailAiAnalysis }>) {
  if (entries.length === 0) return undefined;
  const values: Record<string, string> = {};
  const confirmed = new Set<string>();
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry.analysis.extractedRequirements)) {
      if (typeof value === 'string' && value.trim()) {
        values[key] = value.trim();
        confirmed.add(key);
      }
    }
  }
  const latest = entries.at(-1)!;
  return {
    productType: values.productType,
    structureType: values.structureType,
    frequencyRange: values.frequencyRange,
    power: values.power,
    insertionLoss: values.insertionLoss,
    isolation: values.isolation,
    vswr: values.vswr,
    connector: values.connector,
    quantity: values.quantity,
    sizeRequirement: values.sizeRequirement,
    application: values.application,
    deliveryRequirement: values.deliveryRequirement,
    specialRequirements: values.specialRequirements ? { summary: values.specialRequirements } : {},
    missingFields: latest.analysis.missingFields,
    confirmedFields: Array.from(confirmed),
    sourceEmailMessageIds: entries.map((entry) => entry.emailMessageId),
    confidence: latest.analysis.confidence,
    lastUpdatedBy: 'replay',
    updatedFromEmailMessageId: latest.emailMessageId,
  };
}

function toJson(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}
