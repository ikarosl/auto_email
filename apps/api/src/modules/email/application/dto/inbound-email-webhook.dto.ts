import { EmailSource } from '../../domain/enums/email-source.enum.js';

export interface InboundEmailWebhookDto {
  messageId: string;
  threadId?: string;
  fromEmail: string;
  fromName?: string;
  toEmails?: string[];
  ccEmails?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt?: string;
  source?: EmailSource;
}
