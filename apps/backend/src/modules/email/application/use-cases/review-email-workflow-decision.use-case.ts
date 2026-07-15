import { randomUUID } from 'node:crypto';

import { BusinessError } from '../../../../common/errors/business-error.js';
import { PrismaService } from '../../../../common/database/prisma.service.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { InquiryStateMachine } from '../../../inquiry/domain/state-machine/inquiry-state-machine.js';

export class ReviewEmailWorkflowDecisionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: InquiryStateMachine,
  ) {}

  async apply(id: string, input: { reason?: string; changedBy?: string }) {
    const decision = await this.prisma.emailWorkflowDecision.findUnique({
      where: { id },
      include: { inquiryCase: true },
    });
    if (!decision) throw new BusinessError('Workflow decision not found.', 'WORKFLOW_DECISION_NOT_FOUND');
    if (decision.executionStatus === 'applied') return decision;
    if (!decision.suggestedStatus) {
      throw new BusinessError('Workflow decision has no suggested status.', 'WORKFLOW_DECISION_HAS_NO_STATUS');
    }
    const fromStatus = decision.inquiryCase.status as InquiryStatus;
    const toStatus = decision.suggestedStatus as InquiryStatus;
    const reason = input.reason?.trim() || decision.reason || decision.executionReason || `Apply ${decision.eventType}.`;
    if (!this.stateMachine.canTransition(fromStatus, toStatus, { operatorType: 'human', reason })) {
      throw new BusinessError(
        `Cannot apply workflow decision from ${fromStatus} to ${toStatus}.`,
        'WORKFLOW_DECISION_TRANSITION_REJECTED',
      );
    }
    const now = new Date();
    const applied = await this.prisma.$transaction(async (tx) => {
      const update = await tx.inquiryCase.updateMany({
        where: { id: decision.inquiryCaseId, status: fromStatus },
        data: { status: toStatus, updatedAt: now },
      });
      if (update.count !== 1) {
        await tx.emailWorkflowDecision.update({
          where: { id },
          data: {
            executionStatus: 'conflict',
            executionFromStatus: fromStatus,
            executionToStatus: toStatus,
            executionReason: 'Inquiry status changed before human confirmation was applied.',
            executedAt: now,
            updatedAt: now,
          },
        });
        return false;
      }
      await tx.inquiryStatusLog.create({
        data: {
          id: `status_log_${randomUUID()}`,
          inquiryCaseId: decision.inquiryCaseId,
          fromStatus,
          toStatus,
          reason,
          changedBy: input.changedBy?.trim() || id,
          changedByType: 'human',
        },
      });
      await tx.emailWorkflowDecision.update({
        where: { id },
        data: {
          executionStatus: 'applied',
          executionFromStatus: fromStatus,
          executionToStatus: toStatus,
          executionReason: reason,
          executedAt: now,
          updatedAt: now,
        },
      });
      return true;
    });
    if (!applied) throw new BusinessError('Inquiry status changed. Reload before applying.', 'WORKFLOW_DECISION_CONFLICT');
    return this.prisma.emailWorkflowDecision.findUnique({ where: { id } });
  }

  async reject(id: string, input: { reason: string; changedBy?: string }) {
    const reason = input.reason?.trim();
    if (!reason) throw new BusinessError('A rejection reason is required.', 'WORKFLOW_DECISION_REASON_REQUIRED');
    const existing = await this.prisma.emailWorkflowDecision.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('Workflow decision not found.', 'WORKFLOW_DECISION_NOT_FOUND');
    if (existing.executionStatus === 'applied') {
      throw new BusinessError('An applied decision cannot be rejected.', 'WORKFLOW_DECISION_ALREADY_APPLIED');
    }
    return this.prisma.emailWorkflowDecision.update({
      where: { id },
      data: {
        executionStatus: 'rejected',
        executionReason: `${reason}${input.changedBy ? ` (by ${input.changedBy})` : ''}`,
        executedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}
