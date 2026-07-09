import { EmailAttachment } from '../../domain/entities/email-attachment.entity.js';

export interface CreateEmailAttachmentInput {
  attachment: EmailAttachment;
}

export interface UpdateEmailAttachmentParseResultInput {
  id: string;
  parseStatus: EmailAttachment['parseStatus'];
  parseStrategy?: string;
  parsedText?: string;
  parsedTextPreview?: string;
  parsedTextLength?: number;
  parseErrorCode?: string;
  parseErrorMessage?: string;
  parsedAt?: Date;
  ocrStatus?: EmailAttachment['ocrStatus'];
  ocrProvider?: string;
  ocrText?: string;
  ocrTextPreview?: string;
  ocrResult?: unknown;
  ocrErrorCode?: string;
  ocrAt?: Date;
  isContextCandidate?: boolean;
}

export interface EmailAttachmentRepository {
  save(input: CreateEmailAttachmentInput): Promise<EmailAttachment>;
  updateParseResult(input: UpdateEmailAttachmentParseResultInput): Promise<EmailAttachment>;
  updateInquiryCaseIdByEmailMessageId(emailMessageId: string, inquiryCaseId: string): Promise<void>;
  listByEmailMessageId(emailMessageId: string): Promise<EmailAttachment[]>;
  listByEmailMessageIds(emailMessageIds: string[]): Promise<Map<string, EmailAttachment[]>>;
}
