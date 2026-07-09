export interface ParseAttachmentInput {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  content: Buffer;
}

export interface AttachmentOcrResult {
  status: 'pending' | 'skipped' | 'parsed' | 'failed';
  provider?: string;
  text?: string;
  textPreview?: string;
  resultJson?: unknown;
  errorCode?: string;
}

export interface AttachmentParserResult {
  parseStatus: 'parsed' | 'skipped' | 'failed';
  parseStrategy?: string;
  parsedText?: string;
  parsedTextPreview?: string;
  parseErrorCode?: string;
  parseErrorMessage?: string;
  isContextCandidate?: boolean;
  ocr?: AttachmentOcrResult;
}

export interface AttachmentParserAdapter {
  parse(input: ParseAttachmentInput): Promise<AttachmentParserResult>;
}
