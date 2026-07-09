export interface ReadAttachmentWithAiInput {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
  prompt: string;
}

export interface ReadAttachmentWithAiResult {
  provider: string;
  text: string;
  resultJson?: unknown;
}

export interface AttachmentAiReaderAdapter {
  read(input: ReadAttachmentWithAiInput): Promise<ReadAttachmentWithAiResult | undefined>;
}
