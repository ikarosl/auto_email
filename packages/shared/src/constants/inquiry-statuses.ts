import type {
  InquiryActionOwner,
  InquiryBusinessStage,
  InquiryLifecycleStatus,
} from '../types/api.js';

export const INQUIRY_BUSINESS_STAGE_LABELS = {
  intake: '询盘识别与补参',
  technical_review: '技术评审',
  commercial: '商业沟通与报价',
  contract: '合同阶段',
} as const;

export const INQUIRY_ACTION_OWNER_LABELS = {
  us: '等待我方',
  customer: '等待客户',
  none: '无需行动',
} as const;

export const INQUIRY_LIFECYCLE_STATUS_LABELS = {
  active: '进行中',
  won: '已成交',
  lost: '已流失',
  invalid: '无效询盘',
} as const;

export function getInquiryBusinessStageLabel(value: string): string {
  return INQUIRY_BUSINESS_STAGE_LABELS[value as InquiryBusinessStage] ?? value;
}

export function getInquiryActionOwnerLabel(value: string): string {
  return INQUIRY_ACTION_OWNER_LABELS[value as InquiryActionOwner] ?? value;
}

export function getInquiryLifecycleStatusLabel(value: string): string {
  return INQUIRY_LIFECYCLE_STATUS_LABELS[value as InquiryLifecycleStatus] ?? value;
}
