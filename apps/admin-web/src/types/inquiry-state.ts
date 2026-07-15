import {
  INQUIRY_ACTION_OWNER_LABELS,
  INQUIRY_BUSINESS_STAGE_LABELS,
  INQUIRY_LIFECYCLE_STATUS_LABELS,
} from '@email-inquiry/shared';
import type {
  InquiryActionOwner,
  InquiryBusinessStage,
  InquiryLifecycleStatus,
} from '@email-inquiry/shared';

export type { InquiryActionOwner, InquiryBusinessStage, InquiryLifecycleStatus };

// ── 三维状态枚举 ──

export const BUSINESS_STAGE_LABELS = INQUIRY_BUSINESS_STAGE_LABELS;
export const ACTION_OWNER_LABELS = INQUIRY_ACTION_OWNER_LABELS;
export const LIFECYCLE_STATUS_LABELS = INQUIRY_LIFECYCLE_STATUS_LABELS;

// ── 标签获取函数 ──

export function getStageLabel(stage: string): string {
  return BUSINESS_STAGE_LABELS[stage as InquiryBusinessStage] ?? stage;
}

export function getOwnerLabel(owner: string): string {
  return ACTION_OWNER_LABELS[owner as InquiryActionOwner] ?? owner;
}

export function getLifecycleLabel(status: string): string {
  return LIFECYCLE_STATUS_LABELS[status as InquiryLifecycleStatus] ?? status;
}

// ── API 数据类型 ──

export interface InquiryStateDecisionListItem {
  id: string;
  inquiryCaseId: string;
  emailMessageId?: string | null;
  analysisDecisionId?: string | null;
  replayRunId?: string | null;
  beforeBusinessStage: InquiryBusinessStage;
  beforeActionOwner: InquiryActionOwner;
  beforeLifecycleStatus: InquiryLifecycleStatus;
  beforeStateVersion: number;
  suggestedBusinessStage: InquiryBusinessStage;
  suggestedActionOwner: InquiryActionOwner;
  suggestedLifecycleStatus: InquiryLifecycleStatus;
  appliedBusinessStage?: InquiryBusinessStage | null;
  appliedActionOwner?: InquiryActionOwner | null;
  appliedLifecycleStatus?: InquiryLifecycleStatus | null;
  confidence?: number | null;
  riskLevel?: string | null;
  eventValidationPassed: boolean;
  humanReviewAdvisory: boolean;
  baselineIncomplete: boolean;
  executionStatus: string;
  executionReason?: string | null;
  policyVersion: string;
  decisionSource: string;
  eventOccurredAt: string;
  executedAt?: string | null;
  createdAt: string;
  emailMessage?: {
    fromEmail: string;
    subject?: string | null;
    receivedAt?: string | null;
  } | null;
  transitions?: InquiryStateTransitionListItem[];
}

export interface InquiryBusinessEventListItem {
  id: string;
  inquiryCaseId: string;
  emailMessageId?: string | null;
  analysisDecisionId?: string | null;
  correctedEventId?: string | null;
  eventType: string;
  actor: string;
  sequenceInEmail: number;
  confidence?: number | null;
  evidence?: string | null;
  payloadJson: unknown;
  sourceType: string;
  occurredAt: string;
  createdAt: string;
}

export interface InquiryStateTransitionListItem {
  id: string;
  inquiryCaseId: string;
  stateDecisionId: string;
  fromBusinessStage: InquiryBusinessStage;
  fromActionOwner: InquiryActionOwner;
  fromLifecycleStatus: InquiryLifecycleStatus;
  toBusinessStage: InquiryBusinessStage;
  toActionOwner: InquiryActionOwner;
  toLifecycleStatus: InquiryLifecycleStatus;
  changedDimensionsJson: string[];
  reason?: string | null;
  changedBy?: string | null;
  changedByType: string;
  eventOccurredAt: string;
  processedAt: string;
  createdAt: string;
}

// ── 颜色标记 ──

export function stageTone(stage: string): 'default' | 'warning' | 'success' | 'danger' | 'muted' {
  const map: Record<string, 'default' | 'warning' | 'success' | 'danger' | 'muted'> = {
    intake: 'default',
    technical_review: 'default',
    commercial: 'warning',
    contract: 'success',
  };
  return map[stage] ?? 'default';
}

export function ownerTone(owner: string): 'default' | 'warning' | 'success' {
  const map: Record<string, 'default' | 'warning' | 'success'> = {
    us: 'warning',
    customer: 'default',
    none: 'success',
  };
  return map[owner] ?? 'default';
}

export function lifecycleTone(status: string): 'default' | 'success' | 'danger' | 'muted' {
  const map: Record<string, 'default' | 'success' | 'danger' | 'muted'> = {
    active: 'default',
    won: 'success',
    lost: 'danger',
    invalid: 'muted',
  };
  return map[status] ?? 'default';
}
