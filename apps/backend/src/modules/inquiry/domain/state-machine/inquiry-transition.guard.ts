import { InquiryStatus } from '../enums/inquiry-status.enum.js';
import { getConfiguredNextStatuses } from './inquiry-transitions.js';

export type InquiryTransitionOperatorType = 'human' | 'system' | 'ai';

export interface InquiryTransitionContext {
  operatorType?: InquiryTransitionOperatorType;
  reason?: string;
}

export interface InquiryTransitionValidationResult {
  allowed: boolean;
  reason?: string;
}

function hasReason(context: InquiryTransitionContext): boolean {
  return typeof context.reason === 'string' && context.reason.trim().length > 0;
}

export function validateInquiryTransition(
  fromStatus: InquiryStatus,
  toStatus: InquiryStatus,
  context: InquiryTransitionContext = {},
): InquiryTransitionValidationResult {
  // 相同状态不视为有效流转，避免重复写入状态变更记录。
  if (fromStatus === toStatus) {
    return {
      allowed: false,
      reason: `Inquiry status is already ${toStatus}.`,
    };
  }

  // 基础流转必须先存在于状态流转表中；未配置的路径一律拒绝。
  if (!getConfiguredNextStatuses(fromStatus).includes(toStatus)) {
    return {
      allowed: false,
      reason: `Cannot transition inquiry status from ${fromStatus} to ${toStatus}.`,
    };
  }

  // 标记无效或关闭会终止/弱化推进，需要人工或系统留下原因。
  if ((toStatus === InquiryStatus.INVALID || toStatus === InquiryStatus.CLOSED) && !hasReason(context)) {
    return {
      allowed: false,
      reason: `Transition to ${toStatus} requires a reason.`,
    };
  }

  if (
    (fromStatus === InquiryStatus.INVALID || fromStatus === InquiryStatus.CLOSED) &&
    (context.operatorType !== 'human' || !hasReason(context))
  ) {
    return {
      allowed: false,
      reason: `Restoring an inquiry from ${fromStatus} requires a human operator and a reason.`,
    };
  }

  // ready_for_quote 是报价边界，只允许人工确认进入，AI 和系统都不能自动推进。
  if (toStatus === InquiryStatus.READY_FOR_QUOTE && context.operatorType !== 'human') {
    return {
      allowed: false,
      reason: 'Transition to ready_for_quote requires a human operator.',
    };
  }

  return { allowed: true };
}
