import { getAiAutoTransitionConfig } from '../../../inquiry/domain/policies/ai-auto-transition.policy.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { OutboundEmailEventAnalysis } from '../dto/outbound-email-event-analysis.schema.js';

export const OUTBOUND_EMAIL_EVENT_POLICY_VERSION = 'v1';

export interface OutboundEmailEventPolicyResult {
  executionStatus: 'pending' | 'dry_run' | 'rejected' | 'no_change' | 'eligible';
  fromStatus: InquiryStatus;
  toStatus?: InquiryStatus;
  reason: string;
}

export function evaluateOutboundEmailEvent(
  fromStatus: InquiryStatus,
  analysis: OutboundEmailEventAnalysis,
  env: NodeJS.ProcessEnv = process.env,
): OutboundEmailEventPolicyResult {
  const config = getAiAutoTransitionConfig(env);

  if (!analysis.suggestedStatus) {
    return {
      executionStatus: 'no_change',
      fromStatus,
      reason: 'The outbound event does not suggest a status change.',
    };
  }
  if (analysis.suggestedStatus === fromStatus) {
    return {
      executionStatus: 'no_change',
      fromStatus,
      reason: `Inquiry status is already ${fromStatus}.`,
    };
  }
  if (
    analysis.suggestedStatus === InquiryStatus.WAITING_CUSTOMER &&
    !analysis.responseExpected
  ) {
    return {
      executionStatus: 'pending',
      fromStatus,
      toStatus: analysis.suggestedStatus,
      reason: 'waiting_customer requires an outbound message that explicitly expects a customer response.',
    };
  }
  if (!config.enabled) {
    return {
      executionStatus: 'rejected',
      fromStatus,
      toStatus: analysis.suggestedStatus,
      reason: 'AI automatic status transition is disabled.',
    };
  }
  if (analysis.confidence < config.minimumConfidence) {
    return {
      executionStatus: 'rejected',
      fromStatus,
      toStatus: analysis.suggestedStatus,
      reason: `Confidence ${analysis.confidence} is below required threshold ${config.minimumConfidence}.`,
    };
  }
  if (analysis.riskLevel === 'high') {
    return {
      executionStatus: 'rejected',
      fromStatus,
      toStatus: analysis.suggestedStatus,
      reason: 'High-risk outbound event cannot be applied automatically.',
    };
  }
  if (config.dryRun) {
    return {
      executionStatus: 'dry_run',
      fromStatus,
      toStatus: analysis.suggestedStatus,
      reason: 'Outbound event passed policy but dry-run mode is enabled.',
    };
  }

  return {
    executionStatus: 'eligible',
    fromStatus,
    toStatus: analysis.suggestedStatus,
    reason: `Outbound event passed ${OUTBOUND_EMAIL_EVENT_POLICY_VERSION} policy; human review flags remain advisory.`,
  };
}
