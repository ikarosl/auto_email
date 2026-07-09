import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  CreateEmailAttachmentInput,
  EmailAttachmentRepository,
  UpdateEmailAttachmentParseResultInput,
} from '../../application/ports/email-attachment.repository.js';
import { EmailAttachment } from '../../domain/entities/email-attachment.entity.js';

export class PrismaEmailAttachmentRepository implements EmailAttachmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(input: CreateEmailAttachmentInput): Promise<EmailAttachment> {
    const record = await this.delegate().create({
      data: toCreateData(input.attachment),
    });
    return toDomain(record);
  }

  async updateParseResult(input: UpdateEmailAttachmentParseResultInput): Promise<EmailAttachment> {
    const record = await this.delegate().update({
      where: { id: input.id },
      data: {
        parseStatus: input.parseStatus,
        parseStrategy: input.parseStrategy ?? null,
        parsedText: input.parsedText ?? null,
        parsedTextPreview: input.parsedTextPreview ?? null,
        parsedTextLength: input.parsedTextLength ?? input.parsedText?.length ?? 0,
        parseErrorCode: input.parseErrorCode ?? null,
        parseErrorMessage: input.parseErrorMessage ?? null,
        parsedAt: input.parsedAt ?? null,
        ocrStatus: input.ocrStatus ?? undefined,
        ocrProvider: input.ocrProvider ?? null,
        ocrText: input.ocrText ?? null,
        ocrTextPreview: input.ocrTextPreview ?? null,
        ocrResultJson: input.ocrResult ?? undefined,
        ocrErrorCode: input.ocrErrorCode ?? null,
        ocrAt: input.ocrAt ?? null,
        isContextCandidate: input.isContextCandidate ?? undefined,
        updatedAt: new Date(),
      },
    });
    return toDomain(record);
  }

  async updateInquiryCaseIdByEmailMessageId(emailMessageId: string, inquiryCaseId: string): Promise<void> {
    await this.delegate().updateMany({
      where: { emailMessageId },
      data: {
        inquiryCaseId,
        updatedAt: new Date(),
      },
    });
  }

  async listByEmailMessageId(emailMessageId: string): Promise<EmailAttachment[]> {
    const records = await this.delegate().findMany({
      where: { emailMessageId },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(toDomain);
  }

  async listByEmailMessageIds(emailMessageIds: string[]): Promise<Map<string, EmailAttachment[]>> {
    const result = new Map<string, EmailAttachment[]>();
    if (emailMessageIds.length === 0) return result;

    const records = await this.delegate().findMany({
      where: { emailMessageId: { in: emailMessageIds } },
      orderBy: { createdAt: 'asc' },
    });

    for (const record of records) {
      const attachment = toDomain(record);
      const list = result.get(attachment.emailMessageId) ?? [];
      list.push(attachment);
      result.set(attachment.emailMessageId, list);
    }

    return result;
  }

  private delegate(): any {
    return (this.prisma as any).emailAttachment;
  }
}

function toCreateData(attachment: EmailAttachment) {
  return {
    id: attachment.id,
    emailMessageId: attachment.emailMessageId,
    inquiryCaseId: attachment.inquiryCaseId ?? null,
    originalFileName: attachment.originalFileName ?? null,
    safeFileName: attachment.safeFileName,
    contentId: attachment.contentId ?? null,
    contentDisposition: attachment.contentDisposition ?? null,
    mimeType: attachment.mimeType,
    fileExtension: attachment.fileExtension ?? null,
    fileSize: BigInt(attachment.fileSize),
    contentHash: attachment.contentHash ?? null,
    storageProvider: attachment.storageProvider,
    storagePath: attachment.storagePath ?? null,
    parseStatus: attachment.parseStatus,
    parseStrategy: attachment.parseStrategy ?? null,
    parsedText: attachment.parsedText ?? null,
    parsedTextPreview: attachment.parsedTextPreview ?? null,
    parsedTextLength: attachment.parsedTextLength,
    parseErrorCode: attachment.parseErrorCode ?? null,
    parseErrorMessage: attachment.parseErrorMessage ?? null,
    parsedAt: attachment.parsedAt ?? null,
    ocrStatus: attachment.ocrStatus,
    ocrProvider: attachment.ocrProvider ?? null,
    ocrText: attachment.ocrText ?? null,
    ocrTextPreview: attachment.ocrTextPreview ?? null,
    ocrResultJson: attachment.ocrResult ?? {},
    ocrErrorCode: attachment.ocrErrorCode ?? null,
    ocrAt: attachment.ocrAt ?? null,
    isInline: attachment.isInline,
    isContextCandidate: attachment.isContextCandidate,
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
  };
}

function toDomain(record: any): EmailAttachment {
  return {
    id: record.id,
    emailMessageId: record.emailMessageId,
    inquiryCaseId: record.inquiryCaseId ?? undefined,
    originalFileName: record.originalFileName ?? undefined,
    safeFileName: record.safeFileName,
    contentId: record.contentId ?? undefined,
    contentDisposition: record.contentDisposition ?? undefined,
    mimeType: record.mimeType,
    fileExtension: record.fileExtension ?? undefined,
    fileSize: Number(record.fileSize),
    contentHash: record.contentHash ?? undefined,
    storageProvider: record.storageProvider,
    storagePath: record.storagePath ?? undefined,
    parseStatus: record.parseStatus,
    parseStrategy: record.parseStrategy ?? undefined,
    parsedText: record.parsedText ?? undefined,
    parsedTextPreview: record.parsedTextPreview ?? undefined,
    parsedTextLength: record.parsedTextLength,
    parseErrorCode: record.parseErrorCode ?? undefined,
    parseErrorMessage: record.parseErrorMessage ?? undefined,
    parsedAt: record.parsedAt ?? undefined,
    ocrStatus: record.ocrStatus,
    ocrProvider: record.ocrProvider ?? undefined,
    ocrText: record.ocrText ?? undefined,
    ocrTextPreview: record.ocrTextPreview ?? undefined,
    ocrResult: record.ocrResultJson ?? undefined,
    ocrErrorCode: record.ocrErrorCode ?? undefined,
    ocrAt: record.ocrAt ?? undefined,
    isInline: record.isInline,
    isContextCandidate: record.isContextCandidate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
