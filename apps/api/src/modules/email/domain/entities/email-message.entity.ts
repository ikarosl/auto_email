import { EmailDirection } from '../enums/email-direction.enum.js';
import { EmailSource } from '../enums/email-source.enum.js';

export interface EmailMessage {
  id: string;
  externalMessageId: string;
  threadId?: string;
  direction: EmailDirection;
  source: EmailSource;
  fromEmail: string;
  fromName?: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt: Date;
  raw?: string;
  createdAt: Date;
}
