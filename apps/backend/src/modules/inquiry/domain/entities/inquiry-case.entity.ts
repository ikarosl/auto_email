import { InquiryStatus } from '../enums/inquiry-status.enum.js';

export interface InquiryCase {
  id: string;
  sourceEmailMessageId?: string;
  customerEmail: string;
  customerName?: string;
  customerDomain?: string;
  organizationId?: string;
  primaryCustomerId?: string;
  subject: string;
  rawSubject?: string;
  businessSubject?: string;
  businessSubjectSource?: 'raw_email' | 'ai_generated' | 'human';
  businessSubjectLocked?: boolean;
  businessSubjectUpdatedAt?: Date;
  status: InquiryStatus;
  latestMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
