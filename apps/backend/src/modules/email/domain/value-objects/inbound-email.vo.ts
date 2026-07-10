import { EmailSource } from '../enums/email-source.enum.js';

export interface InboundEmailAttachment {
  originalFileName?: string;
  contentType?: string;
  contentDisposition?: string;
  contentId?: string;
  content: Buffer;
  size?: number;
  checksum?: string;
  isInline?: boolean;
}

export interface InboundEmail {
  messageId: string;
  /** IMAP 邮箱账户 ID（mailbox_accounts.id），用于创建 EmailThread 等关联 */
  mailboxAccountId: string;
  /**
   * External thread hint from email headers, such as In-Reply-To or References.
   * This is not the database email_threads.id.
   */
  threadId?: string;
  /** In-Reply-To 头（直接父邮件 Message-ID） */
  inReplyTo?: string;
  /** References 头完整引用链 */
  references?: string[];
  fromEmail: string;
  fromName?: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: InboundEmailAttachment[];
  receivedAt: Date;
  source: EmailSource;
  raw?: string;
}
