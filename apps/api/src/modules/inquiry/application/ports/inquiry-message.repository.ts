import { InquiryMessage } from '../../domain/entities/inquiry-message.entity.js';

export interface InquiryMessageRepository {
  save(inquiryMessage: InquiryMessage): Promise<InquiryMessage>;
  findByEmailMessageId(emailMessageId: string): Promise<InquiryMessage | undefined>;
  listByInquiryCaseId(inquiryCaseId: string): Promise<InquiryMessage[]>;
  list(): Promise<InquiryMessage[]>;
}
