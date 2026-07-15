import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../../common/database/prisma.service.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { InquiryStateMachine } from '../../../inquiry/domain/state-machine/inquiry-state-machine.js';
import { OutboundEmailEventAnalysis } from '../dto/outbound-email-event-analysis.schema.js';
import {
  OUTBOUND_EMAIL_EVENT_POLICY_VERSION,
  evaluateOutboundEmailEvent,
} from '../services/outbound-email-event.policy.js';

export class ApplyOutboundEmailEventUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: InquiryStateMachine,
  ) {}

  async execute(input: {
    workflowDecisionId: string;
    inquiryCaseId: string;
    analysis: OutboundEmailEventAnalysis;
    historicalBackfill?: boolean;
  }) {
    const inquiry = await this.prisma.inquiryCase.findUnique({ where: { id: input.inquiryCaseId } });
    if (!inquiry) throw new Error(`Inquiry not found: ${input.inquiryCaseId}`);
    const fromStatus = inquiry.status as InquiryStatus;
    const now = new Date();

    if (input.historicalBackfill) {
      return this.record(input.workflowDecisionId, {
        status: 'historical_backfill',
        fromStatus,
        toStatus: input.analysis.suggestedStatus ?? undefined,
        reason: 'Historical manual email was analyzed but cannot change the current inquiry status automatically.',
      }, now);
    }

    const policy = evaluateOutboundEmailEvent(fromStatus, input.analysis);
    if (!policy.toStatus) {
      return this.record(input.workflowDecisionId, {
        status: 'no_change',
        fromStatus,
        reason: policy.reason,
      }, now);
    }
    if (policy.executionStatus !== 'eligible') {
      return this.record(input.workflowDecisionId, {
        status: policy.executionStatus,
        fromStatus,
        toStatus: policy.toStatus,
        reason: policy.reason,
      }, now);
    }
    const toStatus = policy.toStatus;
    if (!this.stateMachine.canTransition(fromStatus, toStatus, {
      operatorType: 'system',
      reason: input.analysis.reason,
    })) {
      return this.record(input.workflowDecisionId, {
        status: 'rejected',
        fromStatus,
        toStatus,
        reason: `State machine rejected ${fromStatus} -> ${toStatus}.`,
      }, now);
    }

    const applied = await this.prisma.$transaction(async (tx) => {
      const update = await tx.inquiryCase.updateMany({
        where: { id: input.inquiryCaseId, status: fromStatus },
        data: { status: toStatus, updatedAt: now },
      });
      if (update.count !== 1) {
        await tx.emailWorkflowDecision.update({
          where: { id: input.workflowDecisionId },
          data: {
            executionStatus: 'conflict',
            executionFromStatus: fromStatus,
            executionToStatus: toStatus,
            executionReason: 'Inquiry status changed before the outbound event was applied.',
            executedAt: now,
            updatedAt: now,
          },
        });
        return false;
      }
      await tx.inquiryStatusLog.create({
        data: {
          id: `status_log_${randomUUID()}`,
          inquiryCaseId: input.inquiryCaseId,
          fromStatus,
          toStatus,
          reason: input.analysis.reason,
          changedBy: input.workflowDecisionId,
          changedByType: 'system',
        },
      });
      await tx.emailWorkflowDecision.update({
        where: { id: input.workflowDecisionId },
        data: {
          executionStatus: 'applied',
          executionFromStatus: fromStatus,
          executionToStatus: toStatus,
          executionReason: policy.reason,
          executedAt: now,
          updatedAt: now,
        },
      });
      return true;
    });

    return {
      status: applied ? 'applied' : 'conflict',
      fromStatus,
      toStatus,
      reason: applied ? policy.reason : 'Inquiry status changed before the outbound event was applied.',
    };
  }

  private async record(
    workflowDecisionId: string,
    result: {
      status: 'pending' | 'dry_run' | 'rejected' | 'no_change' | 'historical_backfill';
      fromStatus: InquiryStatus;
      toStatus?: InquiryStatus;
      reason: string;
    },
    now: Date,
  ) {
    await this.prisma.emailWorkflowDecision.update({
      where: { id: workflowDecisionId },
      data: {
        executionStatus: result.status,
        executionFromStatus: result.fromStatus,
        executionToStatus: result.toStatus ?? null,
        executionReason: result.reason,
        executedAt: now,
        updatedAt: now,
      },
    });
    return result;
  }
}
