import { EmailMessageRepository } from '../../application/ports/email-message.repository.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';

export class InMemoryEmailMessageRepository implements EmailMessageRepository {
  private readonly emailMessages = new Map<string, EmailMessage>();
  private readonly externalIdIndex = new Map<string, string>();

  async save(emailMessage: EmailMessage): Promise<EmailMessage> {
    this.emailMessages.set(emailMessage.id, emailMessage);
    this.externalIdIndex.set(emailMessage.externalMessageId, emailMessage.id);
    return emailMessage;
  }

  async findById(id: string): Promise<EmailMessage | undefined> {
    return this.emailMessages.get(id);
  }

  async findByExternalMessageId(externalMessageId: string): Promise<EmailMessage | undefined> {
    const id = this.externalIdIndex.get(externalMessageId);
    return id ? this.findById(id) : undefined;
  }

  async list(): Promise<EmailMessage[]> {
    return Array.from(this.emailMessages.values());
  }
}
