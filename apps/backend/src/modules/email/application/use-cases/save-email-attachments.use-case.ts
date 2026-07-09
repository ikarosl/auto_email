import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { InboundEmailAttachment } from '../../domain/value-objects/inbound-email.vo.js';
import { EmailAttachment } from '../../domain/entities/email-attachment.entity.js';
import { EmailAttachmentRepository } from '../ports/email-attachment.repository.js';
import { AttachmentParserAdapter } from '../ports/attachment-parser.adapter.js';
import { AttachmentStorageAdapter } from '../ports/attachment-storage.adapter.js';
import { EmailMessageRepository } from '../ports/email-message.repository.js';

export interface SaveEmailAttachmentsInput {
  emailMessageId: string;
  inquiryCaseId?: string;
  attachments?: InboundEmailAttachment[];
}

export class SaveEmailAttachmentsUseCase {
  constructor(
    private readonly attachmentRepository: EmailAttachmentRepository,
    private readonly storageAdapter: AttachmentStorageAdapter,
    private readonly parserAdapter: AttachmentParserAdapter,
    private readonly emailMessageRepository: EmailMessageRepository,
  ) {}

  async execute(input: SaveEmailAttachmentsInput): Promise<EmailAttachment[]> {
    const attachments = input.attachments ?? [];
    if (attachments.length === 0) {
      return [];
    }

    const savedAttachments: EmailAttachment[] = [];
    for (const attachmentInput of attachments) {
      const attachment = await this.saveOne(input, attachmentInput);
      savedAttachments.push(attachment);
    }

    await this.emailMessageRepository.updateAttachmentSummary(
      input.emailMessageId,
      savedAttachments.length,
    );

    return savedAttachments;
  }

  async updateInquiryCaseId(emailMessageId: string, inquiryCaseId: string): Promise<void> {
    await this.attachmentRepository.updateInquiryCaseIdByEmailMessageId(
      emailMessageId,
      inquiryCaseId,
    );
  }

  private async saveOne(
    input: SaveEmailAttachmentsInput,
    attachmentInput: InboundEmailAttachment,
  ): Promise<EmailAttachment> {
    const attachmentId = `attachment_${randomUUID()}`;
    const originalFileName = attachmentInput.originalFileName?.trim() || 'attachment';
    const safeFileName = createSafeFileName(originalFileName, attachmentId);
    const mimeType = attachmentInput.contentType || 'application/octet-stream';
    const fileSize = attachmentInput.size ?? attachmentInput.content.length;
    const maxFileSizeBytes = getMaxFileSizeBytes();
    const isInline = attachmentInput.isInline === true || attachmentInput.contentDisposition === 'inline';
    const now = new Date();
    const contentHash = createHash('sha256').update(attachmentInput.content).digest('hex');

    let storageProvider = 'local';
    let storagePath: string | undefined;
    let storageFailed: Error | undefined;
    try {
      const stored = await this.storageAdapter.store({
        emailMessageId: input.emailMessageId,
        attachmentId,
        safeFileName,
        content: attachmentInput.content,
      });
      storageProvider = stored.storageProvider;
      storagePath = stored.storagePath;
    } catch (error) {
      storageFailed = error instanceof Error ? error : new Error(String(error));
    }

    const initial: EmailAttachment = {
      id: attachmentId,
      emailMessageId: input.emailMessageId,
      inquiryCaseId: input.inquiryCaseId,
      originalFileName,
      safeFileName,
      contentId: attachmentInput.contentId,
      contentDisposition: attachmentInput.contentDisposition,
      mimeType,
      fileExtension: extname(originalFileName).replace(/^\./, '').toLowerCase() || undefined,
      fileSize,
      contentHash,
      storageProvider,
      storagePath,
      parseStatus: storageFailed ? 'failed' : 'pending',
      parseStrategy: undefined,
      parsedText: undefined,
      parsedTextPreview: undefined,
      parsedTextLength: 0,
      parseErrorCode: storageFailed ? 'storage_failed' : undefined,
      parseErrorMessage: storageFailed?.message,
      parsedAt: undefined,
      ocrStatus: 'skipped',
      ocrProvider: undefined,
      ocrText: undefined,
      ocrTextPreview: undefined,
      ocrResult: undefined,
      ocrErrorCode: undefined,
      ocrAt: undefined,
      isInline,
      isContextCandidate: !isInline,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.attachmentRepository.save({ attachment: initial });
    if (storageFailed) return saved;

    if (fileSize <= 0) {
      return this.attachmentRepository.updateParseResult({
        id: attachmentId,
        parseStatus: 'failed',
        parseErrorCode: 'empty_attachment',
        parseErrorMessage: 'Attachment content is empty.',
        isContextCandidate: false,
      });
    }

    if (fileSize > maxFileSizeBytes) {
      return this.attachmentRepository.updateParseResult({
        id: attachmentId,
        parseStatus: 'skipped',
        parseErrorCode: 'file_too_large',
        parseErrorMessage: `Attachment size ${fileSize} exceeds ${maxFileSizeBytes} bytes.`,
        isContextCandidate: false,
      });
    }

    if (isInline) {
      return this.attachmentRepository.updateParseResult({
        id: attachmentId,
        parseStatus: 'skipped',
        parseErrorCode: 'inline_attachment',
        parseErrorMessage: 'Inline attachment is not a context candidate.',
        isContextCandidate: false,
      });
    }

    const parseResult = await this.parserAdapter.parse({
      attachmentId,
      fileName: originalFileName,
      mimeType,
      fileSize,
      content: attachmentInput.content,
    });

    return this.attachmentRepository.updateParseResult({
      id: attachmentId,
      parseStatus: parseResult.parseStatus,
      parseStrategy: parseResult.parseStrategy,
      parsedText: parseResult.parsedText,
      parsedTextPreview: parseResult.parsedTextPreview,
      parsedTextLength: parseResult.parsedText?.length ?? 0,
      parseErrorCode: parseResult.parseErrorCode,
      parseErrorMessage: parseResult.parseErrorMessage,
      parsedAt: new Date(),
      ocrStatus: parseResult.ocr?.status ?? 'skipped',
      ocrProvider: parseResult.ocr?.provider,
      ocrText: parseResult.ocr?.text,
      ocrTextPreview: parseResult.ocr?.textPreview,
      ocrResult: parseResult.ocr?.resultJson,
      ocrErrorCode: parseResult.ocr?.errorCode,
      ocrAt: parseResult.ocr?.status === 'parsed' ? new Date() : undefined,
      isContextCandidate: parseResult.isContextCandidate,
    });
  }
}

function getMaxFileSizeBytes(): number {
  const mb = Number(process.env.ATTACHMENT_MAX_FILE_SIZE_MB || 20);
  return Math.max(1, mb) * 1024 * 1024;
}

function createSafeFileName(originalFileName: string, attachmentId: string): string {
  const normalized = originalFileName
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120)
    .replace(/^_+|_+$/g, '');

  return `${attachmentId}_${normalized || 'attachment'}`;
}
