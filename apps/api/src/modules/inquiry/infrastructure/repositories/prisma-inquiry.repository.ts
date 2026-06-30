import { PrismaService } from '../../../../common/database/prisma.service.js';
import { InquiryRepository } from '../../application/ports/inquiry.repository.js';
import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';

export class PrismaInquiryRepository implements InquiryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(inquiryCase: InquiryCase): Promise<InquiryCase> {
    // 先查找或创建 Customer
    const customer = await this.prisma.customer.upsert({
      where: { email: inquiryCase.customerEmail.toLowerCase().trim() },
      create: {
        email: inquiryCase.customerEmail.toLowerCase().trim(),
        name: inquiryCase.customerName ?? null,
      },
      update: {
        name: inquiryCase.customerName ?? undefined,
      },
    });

    const data = {
      id: inquiryCase.id,
      customerId: customer.id,
      status: inquiryCase.status,
      subject: inquiryCase.subject,
      latestMessageAt: inquiryCase.latestMessageAt,
      createdAt: inquiryCase.createdAt,
      updatedAt: new Date(),
    };

    await this.prisma.inquiryCase.upsert({
      where: { id: inquiryCase.id },
      create: data,
      update: data,
    });

    return inquiryCase;
  }

  async findById(id: string): Promise<InquiryCase | undefined> {
    const record = await this.prisma.inquiryCase.findUnique({
      where: { id },
      include: { customer: true },
    });
    return record ? toDomain(record) : undefined;
  }

  async listOpenByCustomerEmail(customerEmail: string): Promise<InquiryCase[]> {
    const customer = await this.prisma.customer.findUnique({
      where: { email: customerEmail.toLowerCase().trim() },
    });
    if (!customer) return [];

    const records = await this.prisma.inquiryCase.findMany({
      where: {
        customerId: customer.id,
        status: { not: 'closed' },
      },
      include: { customer: true },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map(toDomain);
  }

  async list(): Promise<InquiryCase[]> {
    const records = await this.prisma.inquiryCase.findMany({
      include: { customer: true },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map(toDomain);
  }
}

function toDomain(record: {
  id: string;
  status: string;
  subject: string | null;
  latestMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { email: string; name: string | null };
}): InquiryCase {
  return {
    id: record.id,
    customerEmail: record.customer.email,
    customerName: record.customer.name ?? undefined,
    subject: record.subject ?? '',
    status: record.status as InquiryCase['status'],
    latestMessageAt: record.latestMessageAt ?? record.createdAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
