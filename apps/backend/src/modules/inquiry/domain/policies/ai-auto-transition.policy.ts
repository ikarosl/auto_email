import { EmailAiAnalysis } from '../../../email/domain/value-objects/email-ai-analysis.vo.js';
import { InquiryStatus } from '../enums/inquiry-status.enum.js';

export const AI_AUTO_TRANSITION_POLICY_VERSION = 'v1';

export interface AiAutoTransitionPolicyConfig {
  enabled: boolean;
  dryRun: boolean;
  minimumConfidence: number;
}

export interface AiAutoTransitionPolicyResult {
  allowed: boolean;
  fromStatus: InquiryStatus;
  toStatus: InquiryStatus;
  reason: string;
  policyVersion: string;
}

interface TransitionRule {
  minimumConfidence: number;
  requiresClassification: EmailAiAnalysis['classification'];
  requiresMissingFields?: boolean;
  forbidsQuoteBoundary?: boolean;
  allowedRiskLevels: readonly EmailAiAnalysis['riskLevel'][];
}

const RULES: Partial<Record<InquiryStatus, Partial<Record<InquiryStatus, TransitionRule>>>> = {
  [InquiryStatus.NEW]: {
    [InquiryStatus.INVALID]: {
      minimumConfidence: 0.9,
      requiresClassification: 'invalid',
      allowedRiskLevels: ['low', 'medium'],
    },
    [InquiryStatus.NEED_CLARIFICATION]: {
      minimumConfidence: 0.85,
      requiresClassification: 'valid_inquiry',
      requiresMissingFields: true,
      forbidsQuoteBoundary: true,
      allowedRiskLevels: ['low', 'medium'],
    },
    [InquiryStatus.NEED_ENGINEER_REVIEW]: {
      minimumConfidence: 0.85,
      requiresClassification: 'valid_inquiry',
      allowedRiskLevels: ['low', 'medium'],
    },
  },
  [InquiryStatus.NEED_CLARIFICATION]: {
    [InquiryStatus.NEED_ENGINEER_REVIEW]: {
      minimumConfidence: 0.85,
      requiresClassification: 'valid_inquiry',
      allowedRiskLevels: ['low', 'medium'],
    },
  },
  [InquiryStatus.WAITING_CUSTOMER]: {
    [InquiryStatus.NEED_CLARIFICATION]: {
      minimumConfidence: 0.85,
      requiresClassification: 'valid_inquiry',
      requiresMissingFields: true,
      forbidsQuoteBoundary: true,
      allowedRiskLevels: ['low', 'medium'],
    },
    [InquiryStatus.NEED_ENGINEER_REVIEW]: {
      minimumConfidence: 0.85,
      requiresClassification: 'valid_inquiry',
      allowedRiskLevels: ['low', 'medium'],
    },
  },
};

export function evaluateAiAutoTransition(
  fromStatus: InquiryStatus,
  analysis: EmailAiAnalysis,
  config: AiAutoTransitionPolicyConfig,
): AiAutoTransitionPolicyResult {
  const toStatus = analysis.suggestedStatus;
  const reject = (reason: string): AiAutoTransitionPolicyResult => ({
    allowed: false,
    fromStatus,
    toStatus,
    reason,
    policyVersion: AI_AUTO_TRANSITION_POLICY_VERSION,
  });

  if (!config.enabled) return reject('AI automatic status transition is disabled.');

  const rule = RULES[fromStatus]?.[toStatus];
  if (!rule) return reject(`No automatic transition policy for ${fromStatus} -> ${toStatus}.`);
  if (analysis.classification !== rule.requiresClassification) {
    return reject(`Classification ${analysis.classification} does not satisfy the transition policy.`);
  }

  const effectiveThreshold = Math.max(config.minimumConfidence, rule.minimumConfidence);
  if (analysis.confidence < effectiveThreshold) {
    return reject(`Confidence ${analysis.confidence} is below required threshold ${effectiveThreshold}.`);
  }
  if (!rule.allowedRiskLevels.includes(analysis.riskLevel)) {
    return reject(`Risk level ${analysis.riskLevel} is not allowed for automatic transition.`);
  }
  if (rule.requiresMissingFields && analysis.missingFields.length === 0) {
    return reject('The transition policy requires at least one missing field.');
  }
  if (rule.forbidsQuoteBoundary && analysis.quoteBoundaryDetected) {
    return reject('Quotation boundary requires human review.');
  }

  return {
    allowed: true,
    fromStatus,
    toStatus,
    reason: `AI suggestion passed ${AI_AUTO_TRANSITION_POLICY_VERSION} policy.`,
    policyVersion: AI_AUTO_TRANSITION_POLICY_VERSION,
  };
}

export function getAiAutoTransitionConfig(env: NodeJS.ProcessEnv): AiAutoTransitionPolicyConfig {
  return {
    enabled: parseBoolean(env.AI_STATUS_TRANSITION_ENABLED, false),
    dryRun: parseBoolean(env.AI_STATUS_TRANSITION_DRY_RUN, true),
    minimumConfidence: parseConfidence(env.AI_STATUS_TRANSITION_MIN_CONFIDENCE, 0.9),
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseConfidence(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}
