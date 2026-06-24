import { EmailMessage } from '../../domain/entities/email-message.entity.js';

export interface EmailMessageRepository {
  save(emailMessage: EmailMessage): Promise<EmailMessage>;
  findById(id: string): Promise<EmailMessage | undefined>;
  findByExternalMessageId(externalMessageId: string): Promise<EmailMessage | undefined>;
  listByThreadId(threadId: string): Promise<EmailMessage[]>;
  list(): Promise<EmailMessage[]>;
}
