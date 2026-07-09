import { PrismaService } from '../../../../common/database/prisma.service.js';
import { InquiryMessageRepository } from '../../application/ports/inquiry-message.repository.js';
import { InquiryMessage } from '../../domain/entities/inquiry-message.entity.js';

export class PrismaInquiryMessageRepository implements InquiryMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(inquiryMessage: InquiryMessage): Promise<InquiryMessage> {
    const data = {
      id: inquiryMessage.id,
      inquiryCaseId: inquiryMessage.inquiryCaseId,
      emailMessageId: inquiryMessage.emailMessageId,
      direction: inquiryMessage.direction,
      relationType: inquiryMessage.relationType,
      createdByType: inquiryMessage.createdByType ?? 'system',
      createdBy: inquiryMessage.createdBy ?? null,
      relationReason: inquiryMessage.relationReason ?? null,
      createdAt: inquiryMessage.createdAt,
      updatedAt: inquiryMessage.updatedAt ?? new Date(),
    };

    await this.prisma.inquiryMessage.upsert({
      where: {
        inquiryCaseId_emailMessageId: {
          inquiryCaseId: inquiryMessage.inquiryCaseId,
          emailMessageId: inquiryMessage.emailMessageId,
        },
      },
      create: { ...data, id: inquiryMessage.id },
      update: data,
    });

    return inquiryMessage;
  }

  async findByEmailMessageId(emailMessageId: string): Promise<InquiryMessage | undefined> {
    const record = await this.prisma.inquiryMessage.findFirst({
      where: { emailMessageId },
    });
    return record ? toDomain(record) : undefined;
  }

  async listByInquiryCaseId(inquiryCaseId: string): Promise<InquiryMessage[]> {
    const records = await this.prisma.inquiryMessage.findMany({
      where: { inquiryCaseId },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(toDomain);
  }

  async list(): Promise<InquiryMessage[]> {
    const records = await this.prisma.inquiryMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toDomain);
  }
}

function toDomain(record: {
  id: string;
  inquiryCaseId: string;
  emailMessageId: string;
  direction: string;
  relationType: string;
  createdByType: string;
  createdBy: string | null;
  relationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): InquiryMessage {
  return {
    id: record.id,
    inquiryCaseId: record.inquiryCaseId,
    emailMessageId: record.emailMessageId,
    direction: record.direction as InquiryMessage['direction'],
    relationType: record.relationType as InquiryMessage['relationType'],
    createdByType: record.createdByType as InquiryMessage['createdByType'],
    createdBy: record.createdBy ?? undefined,
    relationReason: record.relationReason ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
