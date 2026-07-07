import { InquiryStatus } from '../enums/inquiry-status.enum.js';

export interface InquiryCase {
  id: string;
  sourceEmailMessageId?: string;
  customerEmail: string;
  customerName?: string;
  subject: string;
  status: InquiryStatus;
  latestMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
