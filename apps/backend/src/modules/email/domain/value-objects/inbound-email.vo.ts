import { EmailSource } from '../enums/email-source.enum.js';

export interface InboundEmail {
  messageId: string;
  /** IMAP 邮箱账户 ID（mailbox_accounts.id），用于创建 EmailThread 等关联 */
  mailboxAccountId: string;
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
