import { InquiryStatus } from '../enums/inquiry-status.enum.js';

export const INQUIRY_TRANSITIONS = {
  [InquiryStatus.NEW]: [
    InquiryStatus.INVALID,
    InquiryStatus.NEED_CLARIFICATION,
    InquiryStatus.NEED_ENGINEER_REVIEW,
    InquiryStatus.CLOSED,
  ],
  [InquiryStatus.INVALID]: [InquiryStatus.NEW],
  [InquiryStatus.NEED_CLARIFICATION]: [
    InquiryStatus.WAITING_CUSTOMER,
    InquiryStatus.NEED_ENGINEER_REVIEW,
    InquiryStatus.CLOSED,
  ],
  [InquiryStatus.WAITING_CUSTOMER]: [
    InquiryStatus.NEED_CLARIFICATION,
    InquiryStatus.NEED_ENGINEER_REVIEW,
    InquiryStatus.READY_FOR_QUOTE,
    InquiryStatus.CLOSED,
  ],
  [InquiryStatus.NEED_ENGINEER_REVIEW]: [
    InquiryStatus.NEED_CLARIFICATION,
    InquiryStatus.WAITING_CUSTOMER,
    InquiryStatus.READY_FOR_QUOTE,
    InquiryStatus.CLOSED,
  ],
  [InquiryStatus.READY_FOR_QUOTE]: [InquiryStatus.QUOTED, InquiryStatus.CLOSED],
  [InquiryStatus.QUOTED]: [InquiryStatus.READY_FOR_QUOTE, InquiryStatus.CLOSED],
  [InquiryStatus.CLOSED]: [InquiryStatus.NEW],
} as const satisfies Record<InquiryStatus, readonly InquiryStatus[]>;

export function getConfiguredNextStatuses(fromStatus: InquiryStatus): readonly InquiryStatus[] {
  return INQUIRY_TRANSITIONS[fromStatus];
}
