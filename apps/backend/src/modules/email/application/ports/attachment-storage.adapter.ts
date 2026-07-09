export interface StoreAttachmentInput {
  emailMessageId: string;
  attachmentId: string;
  safeFileName: string;
  content: Buffer;
}

export interface StoreAttachmentResult {
  storageProvider: string;
  storagePath: string;
}

export interface AttachmentStorageAdapter {
  store(input: StoreAttachmentInput): Promise<StoreAttachmentResult>;
}
