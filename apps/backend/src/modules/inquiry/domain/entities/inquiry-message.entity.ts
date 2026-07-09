import { InquiryMessageRelationType } from '../enums/inquiry-message-relation-type.enum.js';

export type InquiryMessageDirection = 'inbound' | 'outbound';

export interface InquiryMessage {
  id: string;
  inquiryCaseId: string;
  emailMessageId: string;
  direction: InquiryMessageDirection;
  relationType: InquiryMessageRelationType;
  createdByType?: 'system' | 'human' | 'ai';
  createdBy?: string;
  relationReason?: string;
  createdAt: Date;
  updatedAt?: Date;
}
