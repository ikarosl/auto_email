import { EmailDirection } from '../enums/email-direction.enum.js';
import { EmailSource } from '../enums/email-source.enum.js';

export interface EmailMessageAttachment {
  id?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  parseStatus: 'parsed' | 'skipped' | 'failed';
  textSource?: 'pdf_text' | 'plain_text' | 'ocr' | 'none';
  parsedTextPreview?: string;
  parsedText?: string;
  parseErrorCode?: string;
  ocrStatus?: 'pending' | 'skipped' | 'parsed' | 'failed';
  ocrTextPreview?: string;
  ocrText?: string;
  ocrErrorCode?: string;
  truncated?: boolean;
  isContextCandidate?: boolean;
}

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
  attachments?: EmailMessageAttachment[];
  receivedAt: Date;
  raw?: string;
  createdAt: Date;
}
