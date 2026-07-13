import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../../common/database/prisma.service.js';
import { EmailAiAnalysis } from '../../../email/domain/value-objects/email-ai-analysis.vo.js';
import { InquiryStatus } from '../../domain/enums/inquiry-status.enum.js';
import {
  evaluateAiAutoTransition,
  getAiAutoTransitionConfig,
} from '../../domain/policies/ai-auto-transition.policy.js';
import { InquiryStateMachine } from '../../domain/state-machine/inquiry-state-machine.js';

export type AiTransitionExecutionStatus =
  | 'disabled'
  | 'rejected'
  | 'dry_run'
  | 'applied'
  | 'conflict';

export interface ApplyAiSuggestedStatusInput {
  aiDecisionId: string;
  inquiryCaseId: string;
  analysis: EmailAiAnalysis;
}

export interface ApplyAiSuggestedStatusResult {
  status: AiTransitionExecutionStatus;
  fromStatus: InquiryStatus;
  toStatus: InquiryStatus;
  reason: string;
}

export class ApplyAiSuggestedStatusUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: InquiryStateMachine,
  ) {}

  async execute(input: ApplyAiSuggestedStatusInput): Promise<ApplyAiSuggestedStatusResult> {
    const inquiry = await this.prisma.inquiryCase.findUnique({
      where: { id: input.inquiryCaseId },
      select: { status: true },
    });
    if (!inquiry) throw new Error(`Inquiry not found: ${input.inquiryCaseId}`);

    const fromStatus = inquiry.status as InquiryStatus;
    const config = getAiAutoTransitionConfig(process.env);
    const policy = evaluateAiAutoTransition(fromStatus, input.analysis, config);
    const now = new Date();

    if (!config.enabled) {
      await this.recordDecision(input.aiDecisionId, 'disabled', policy, now);
      return { status: 'disabled', ...pickResult(policy) };
    }
    if (!policy.allowed) {
      await this.recordDecision(input.aiDecisionId, 'rejected', policy, now);
      return { status: 'rejected', ...pickResult(policy) };
    }
    if (!this.stateMachine.canTransition(fromStatus, policy.toStatus, {
      operatorType: 'ai',
      reason: input.analysis.reason,
    })) {
      const reason = `State machine rejected ${fromStatus} -> ${policy.toStatus}.`;
      await this.recordDecision(input.aiDecisionId, 'rejected', { ...policy, reason }, now);
      return { status: 'rejected', fromStatus, toStatus: policy.toStatus, reason };
    }
    if (config.dryRun) {
      await this.recordDecision(input.aiDecisionId, 'dry_run', policy, now);
      return { status: 'dry_run', ...pickResult(policy) };
    }

    const applied = await this.prisma.$transaction(async (tx) => {
      const update = await tx.inquiryCase.updateMany({
        where: { id: input.inquiryCaseId, status: fromStatus },
        data: { status: policy.toStatus, updatedAt: now },
      });
      if (update.count !== 1) {
        await tx.aiDecision.update({
          where: { id: input.aiDecisionId },
          data: {
            executionStatus: 'conflict',
            executionFromStatus: fromStatus,
            executionToStatus: policy.toStatus,
            executionReason: 'Inquiry status changed before the AI transition was applied.',
            executionPolicyVersion: policy.policyVersion,
            executedAt: now,
          },
        });
        return false;
      }

      await tx.inquiryStatusLog.create({
        data: {
          id: `status_log_${randomUUID()}`,
          inquiryCaseId: input.inquiryCaseId,
          fromStatus,
          toStatus: policy.toStatus,
          reason: input.analysis.reason,
          changedBy: input.aiDecisionId,
          changedByType: 'ai',
        },
      });
      await tx.aiDecision.update({
        where: { id: input.aiDecisionId },
        data: {
          executionStatus: 'applied',
          executionFromStatus: fromStatus,
          executionToStatus: policy.toStatus,
          executionReason: policy.reason,
          executionPolicyVersion: policy.policyVersion,
          executedAt: now,
        },
      });
      return true;
    });

    return applied
      ? { status: 'applied', ...pickResult(policy) }
      : {
          status: 'conflict',
          fromStatus,
          toStatus: policy.toStatus,
          reason: 'Inquiry status changed before the AI transition was applied.',
        };
  }

  private async recordDecision(
    aiDecisionId: string,
    status: Exclude<AiTransitionExecutionStatus, 'applied' | 'conflict'>,
    policy: ReturnType<typeof evaluateAiAutoTransition>,
    executedAt: Date,
  ): Promise<void> {
    await this.prisma.aiDecision.update({
      where: { id: aiDecisionId },
      data: {
        executionStatus: status,
        executionFromStatus: policy.fromStatus,
        executionToStatus: policy.toStatus,
        executionReason: policy.reason,
        executionPolicyVersion: policy.policyVersion,
        executedAt,
      },
    });
  }
}

function pickResult(policy: ReturnType<typeof evaluateAiAutoTransition>) {
  return {
    fromStatus: policy.fromStatus,
    toStatus: policy.toStatus,
    reason: policy.reason,
  };
}
