import { InquiryMessageRelationType } from '../../domain/enums/inquiry-message-relation-type.enum.js';

export type LinkInquiryMessageMode = 'link_existing_email' | 'create_manual_email';

export interface CreateManualEmailFields {
  direction: 'inbound' | 'outbound';
  fromEmail: string;
  fromName?: string;
  toEmails?: string[];
  ccEmails?: string[];
  subject: string;
  bodyText?: string;
  /** ISO 8601 date string */
  receivedAt: string;
}

export type LinkInquiryMessageDto = {
  mode: LinkInquiryMessageMode;
  relationType?: InquiryMessageRelationType;
  relationReason?: string;
  changedBy?: string;
} & ({ mode: 'link_existing_email'; emailMessageId: string } | { mode: 'create_manual_email' } & CreateManualEmailFields);
