export type EmailAttachmentParseStatus = 'pending' | 'parsed' | 'skipped' | 'failed';
export type EmailAttachmentOcrStatus = 'pending' | 'skipped' | 'parsed' | 'failed';

export interface EmailAttachment {
  id: string;
  emailMessageId: string;
  inquiryCaseId?: string;
  originalFileName?: string;
  safeFileName: string;
  contentId?: string;
  contentDisposition?: string;
  mimeType: string;
  fileExtension?: string;
  fileSize: number;
  contentHash?: string;
  storageProvider: 'local' | string;
  storagePath?: string;
  parseStatus: EmailAttachmentParseStatus;
  parseStrategy?: string;
  parsedText?: string;
  parsedTextPreview?: string;
  parsedTextLength: number;
  parseErrorCode?: string;
  parseErrorMessage?: string;
  parsedAt?: Date;
  ocrStatus: EmailAttachmentOcrStatus;
  ocrProvider?: string;
  ocrText?: string;
  ocrTextPreview?: string;
  ocrResult?: unknown;
  ocrErrorCode?: string;
  ocrAt?: Date;
  isInline: boolean;
  isContextCandidate: boolean;
  createdAt: Date;
  updatedAt: Date;
}
