import { InquiryCase } from '../entities/inquiry-case.entity.js';

export enum InquiryMatchingReason {
  THREAD_ID_MATCH = 'thread_id_match',
  SAME_CUSTOMER_RECENT_OPEN_INQUIRY = 'same_customer_recent_open_inquiry',
  SAME_ORGANIZATION_RECENT_OPEN_INQUIRY = 'same_organization_recent_open_inquiry',
  MULTIPLE_OPEN_INQUIRIES = 'multiple_open_inquiries',
  NO_MATCH = 'no_match',
}

export interface InquiryMatchingResult {
  matched: boolean;
  reason: InquiryMatchingReason;
  inquiryCase?: InquiryCase;
  manualReviewRequired: boolean;
}
