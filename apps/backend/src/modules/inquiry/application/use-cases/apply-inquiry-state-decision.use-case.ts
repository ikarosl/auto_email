import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  InquiryActionOwner,
  InquiryBusinessStage,
  InquiryLifecycleStatus,
} from '../../domain/enums/inquiry-state.enum.js';

export class ApplyInquiryStateDecisionUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async applyAutomatic(decisionId: string, safeState: StateValue, pendingLifecycleStatus?: InquiryLifecycleStatus) {
    return this.apply(decisionId, safeState, {
      changedBy: decisionId,
      changedByType: 'ai',
      executionStatus: pendingLifecycleStatus ? 'partially_applied' : 'applied',
      executionReason: pendingLifecycleStatus
        ? `${pendingLifecycleStatus} remains pending human confirmation.`
        : 'Validated state proposal was applied automatically.',
    });
  }

  async applyPending(decisionId: string, changedBy = 'internal_admin', reason?: string) {
    const decision = await this.prisma.inquiryStateDecision.findUnique({ where: { id: decisionId } });
    if (!decision) throw new Error(`State decision not found: ${decisionId}`);
    const reviewableStatuses = [
      'pending',
      'pending_review',
      'partially_applied',
      'dry_run',
      'disabled',
      'rejected',
      'conflict',
      'historical_backfill',
    ];
    if (!reviewableStatuses.includes(decision.executionStatus)) {
      throw new Error(`State decision ${decisionId} cannot be applied from ${decision.executionStatus}.`);
    }
    return this.apply(decisionId, {
      businessStage: decision.suggestedBusinessStage,
      actionOwner: decision.suggestedActionOwner,
      lifecycleStatus: decision.suggestedLifecycleStatus,
    }, {
      changedBy,
      changedByType: 'human',
      executionStatus: 'applied',
      executionReason: reason?.trim() || 'State proposal was applied by a human operator.',
    });
  }

  async reject(decisionId: string, reason: string) {
    const decision = await this.prisma.inquiryStateDecision.findUnique({ where: { id: decisionId } });
    if (!decision) throw new Error(`State decision not found: ${decisionId}`);
    if (['applied', 'partially_applied', 'no_change'].includes(decision.executionStatus)) {
      throw new Error(`State decision ${decisionId} has already been executed.`);
    }
    return this.prisma.inquiryStateDecision.update({
      where: { id: decisionId },
      data: {
        executionStatus: 'rejected',
        executionReason: reason,
        executedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private async apply(
    decisionId: string,
    target: StateValue,
    audit: {
      changedBy: string;
      changedByType: string;
      executionStatus: string;
      executionReason: string;
    },
  ) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const decision = await tx.inquiryStateDecision.findUnique({ where: { id: decisionId } });
      if (!decision) throw new Error(`State decision not found: ${decisionId}`);
      const inquiry = await tx.inquiryCase.findUnique({ where: { id: decision.inquiryCaseId } });
      if (!inquiry) throw new Error(`Inquiry not found: ${decision.inquiryCaseId}`);

      if (
        audit.changedByType === 'ai'
        && (
          inquiry.stateVersion !== decision.beforeStateVersion
          || inquiry.businessStage !== decision.beforeBusinessStage
          || inquiry.actionOwner !== decision.beforeActionOwner
          || inquiry.lifecycleStatus !== decision.beforeLifecycleStatus
        )
      ) {
        return tx.inquiryStateDecision.update({
          where: { id: decisionId },
          data: {
            executionStatus: 'conflict',
            executionReason: 'Inquiry state changed before this decision was applied.',
            executedAt: now,
            updatedAt: now,
          },
        });
      }

      const changedDimensions = readChangedDimensions(inquiry, target);
      if (changedDimensions.length === 0) {
        return tx.inquiryStateDecision.update({
          where: { id: decisionId },
          data: {
            appliedBusinessStage: inquiry.businessStage,
            appliedActionOwner: inquiry.actionOwner,
            appliedLifecycleStatus: inquiry.lifecycleStatus,
            executionStatus: audit.executionStatus === 'partially_applied' ? 'partially_applied' : 'no_change',
            executionReason: audit.executionReason,
            executedAt: now,
            updatedAt: now,
          },
        });
      }

      const update = await tx.inquiryCase.updateMany({
        where: {
          id: inquiry.id,
          stateVersion: inquiry.stateVersion,
          businessStage: inquiry.businessStage,
          actionOwner: inquiry.actionOwner,
          lifecycleStatus: inquiry.lifecycleStatus,
        },
        data: {
          ...target,
          stateVersion: { increment: 1 },
          closedAt: target.lifecycleStatus === InquiryLifecycleStatus.ACTIVE ? null : now,
          updatedAt: now,
        },
      });
      if (update.count !== 1) {
        return tx.inquiryStateDecision.update({
          where: { id: decisionId },
          data: {
            executionStatus: 'conflict',
            executionReason: 'Inquiry state changed before this decision was applied.',
            executedAt: now,
            updatedAt: now,
          },
        });
      }

      await tx.inquiryStateTransition.create({
        data: {
          id: `state_transition_${randomUUID()}`,
          inquiryCaseId: inquiry.id,
          stateDecisionId: decision.id,
          fromBusinessStage: inquiry.businessStage,
          fromActionOwner: inquiry.actionOwner,
          fromLifecycleStatus: inquiry.lifecycleStatus,
          toBusinessStage: target.businessStage,
          toActionOwner: target.actionOwner,
          toLifecycleStatus: target.lifecycleStatus,
          changedDimensionsJson: changedDimensions,
          reason: audit.executionReason,
          changedBy: audit.changedBy,
          changedByType: audit.changedByType,
          eventOccurredAt: decision.eventOccurredAt,
          processedAt: now,
          createdAt: now,
        },
      });

      return tx.inquiryStateDecision.update({
        where: { id: decisionId },
        data: {
          appliedBusinessStage: target.businessStage,
          appliedActionOwner: target.actionOwner,
          appliedLifecycleStatus: target.lifecycleStatus,
          executionStatus: audit.executionStatus,
          executionReason: audit.executionReason,
          executedAt: now,
          updatedAt: now,
        },
      });
    });
  }
}

interface StateValue {
  businessStage: InquiryBusinessStage;
  actionOwner: InquiryActionOwner;
  lifecycleStatus: InquiryLifecycleStatus;
}

function readChangedDimensions(current: StateValue, target: StateValue): string[] {
  const changed: string[] = [];
  if (current.businessStage !== target.businessStage) changed.push('businessStage');
  if (current.actionOwner !== target.actionOwner) changed.push('actionOwner');
  if (current.lifecycleStatus !== target.lifecycleStatus) changed.push('lifecycleStatus');
  return changed;
}
