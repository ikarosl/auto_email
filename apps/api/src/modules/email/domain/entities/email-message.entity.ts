import { EmailDirection } from '../enums/email-direction.enum.js';
import { EmailSource } from '../enums/email-source.enum.js';

export interface EmailMessage {
  id: string;
  externalMessageId: string;
  /**
   * External thread hint from email headers, such as In-Reply-To or References.
   * This is not the database email_threads.id.
   */
  threadId?: string;
  /** Database email_threads.id after persistence resolves the communication thread. */
  emailThreadId?: string;
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
