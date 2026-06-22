import { EmailSource } from '../enums/email-source.enum.js';

export interface InboundEmail {
  messageId: string;
  threadId?: string;
  fromEmail: string;
  fromName?: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt: Date;
  source: EmailSource;
  raw?: string;
}
