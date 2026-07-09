import { InquiryMessageRelationType } from '../../domain/enums/inquiry-message-relation-type.enum.js';

export type LinkInquiryMessageMode = 'link_existing_email' | 'create_manual_email';

export interface LinkInquiryMessageDto {
  mode: LinkInquiryMessageMode;
  emailMessageId?: string;
  relationType?: InquiryMessageRelationType;
  relationReason?: string;
  changedBy?: string;
}
