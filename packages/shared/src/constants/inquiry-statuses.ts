import type { InquiryStatus } from '../types/api.js';

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  new: '新询盘',
  invalid: '无效询盘',
  need_clarification: '需补充信息',
  need_engineer_review: '需工程师评审',
  waiting_customer: '等待客户',
  ready_for_quote: '可报价',
  quoted: '已报价',
  closed: '已关闭',
};

export function getInquiryStatusLabel(status: string): string {
  return INQUIRY_STATUS_LABELS[status as InquiryStatus] ?? status;
}
