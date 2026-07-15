import {
  InquiryActionOwner,
  InquiryBusinessStage,
  InquiryLifecycleStatus,
} from '../enums/inquiry-state.enum.js';

export type InquiryProcessingMode = 'automatic' | 'manual';

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
  businessStage: InquiryBusinessStage;
  actionOwner: InquiryActionOwner;
  lifecycleStatus: InquiryLifecycleStatus;
  stateVersion: number;
  processingMode: InquiryProcessingMode;
  processingModeReason?: string;
  processingModeChangedAt?: Date;
  processingModeChangedBy?: string;
  latestMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
