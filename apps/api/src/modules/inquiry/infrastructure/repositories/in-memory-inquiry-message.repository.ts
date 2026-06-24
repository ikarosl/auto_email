import { InquiryMessageRepository } from '../../application/ports/inquiry-message.repository.js';
import { InquiryMessage } from '../../domain/entities/inquiry-message.entity.js';

export class InMemoryInquiryMessageRepository implements InquiryMessageRepository {
  private readonly inquiryMessages = new Map<string, InquiryMessage>();
  private readonly emailMessageIndex = new Map<string, string>();

  async save(inquiryMessage: InquiryMessage): Promise<InquiryMessage> {
    const existingId = this.emailMessageIndex.get(inquiryMessage.emailMessageId);
    const id = existingId ?? inquiryMessage.id;
    const saved = {
      ...inquiryMessage,
      id,
    };

    this.inquiryMessages.set(id, saved);
    this.emailMessageIndex.set(saved.emailMessageId, id);
    return saved;
  }

  async findByEmailMessageId(emailMessageId: string): Promise<InquiryMessage | undefined> {
    const id = this.emailMessageIndex.get(emailMessageId);
    return id ? this.inquiryMessages.get(id) : undefined;
  }

  async listByInquiryCaseId(inquiryCaseId: string): Promise<InquiryMessage[]> {
    return Array.from(this.inquiryMessages.values()).filter(
      (inquiryMessage) => inquiryMessage.inquiryCaseId === inquiryCaseId,
    );
  }

  async list(): Promise<InquiryMessage[]> {
    return Array.from(this.inquiryMessages.values());
  }
}
