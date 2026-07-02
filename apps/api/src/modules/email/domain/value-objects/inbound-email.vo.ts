import { EmailSource } from '../enums/email-source.enum.js';

export interface InboundEmail {
  messageId: string;
  /**
   * External thread hint from email headers, such as In-Reply-To or References.
   * This is not the database email_threads.id.
   */
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
