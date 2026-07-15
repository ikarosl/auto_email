import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  EnsureCustomerContactInput,
  InquiryRepository,
} from '../../application/ports/inquiry.repository.js';
import { InquiryCase } from '../../domain/entities/inquiry-case.entity.js';
import {
  canUseDomainForOrganizationMatching,
  extractEmailDomain,
  inferCompanyNameFromEmailDomain,
} from '../../domain/matching/email-domain-policy.js';

export class PrismaInquiryRepository implements InquiryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(inquiryCase: InquiryCase): Promise<InquiryCase> {
    const contact = await this.resolveCustomerContact({
      email: inquiryCase.customerEmail,
      name: inquiryCase.customerName,
    });

    const now = new Date();
    const data = {
      id: inquiryCase.id,
      customerId: contact.customer.id,
      organizationId: contact.organization?.id ?? inquiryCase.organizationId ?? null,
      primaryCustomerId: contact.customer.id,
      businessStage: inquiryCase.businessStage,
      actionOwner: inquiryCase.actionOwner,
      lifecycleStatus: inquiryCase.lifecycleStatus,
      stateVersion: inquiryCase.stateVersion,
      subject: inquiryCase.subject,
      rawSubject: inquiryCase.rawSubject ?? inquiryCase.subject,
      businessSubject: inquiryCase.businessSubject ?? inquiryCase.subject,
      businessSubjectSource: inquiryCase.businessSubjectSource ?? 'raw_email',
      businessSubjectLocked: inquiryCase.businessSubjectLocked ?? false,
      businessSubjectUpdatedAt: inquiryCase.businessSubjectUpdatedAt ?? now,
      latestMessageAt: inquiryCase.latestMessageAt,
      createdAt: inquiryCase.createdAt,
      updatedAt: now,
    };

    await this.prisma.inquiryCase.upsert({
      where: { id: inquiryCase.id },
      create: data,
      update: data,
    });

    return {
      ...inquiryCase,
      customerDomain: contact.domain,
      organizationId: data.organizationId ?? undefined,
      primaryCustomerId: contact.customer.id,
      rawSubject: data.rawSubject,
      businessSubject: data.businessSubject,
      businessSubjectSource: data.businessSubjectSource as InquiryCase['businessSubjectSource'],
      businessSubjectLocked: data.businessSubjectLocked,
      businessSubjectUpdatedAt: data.businessSubjectUpdatedAt,
      updatedAt: data.updatedAt,
    };
  }

  async ensureCustomerContact(input: EnsureCustomerContactInput): Promise<void> {
    await this.resolveCustomerContact(input);
  }

  async findById(id: string): Promise<InquiryCase | undefined> {
    const record = await this.prisma.inquiryCase.findUnique({
      where: { id },
      include: { customer: true, organization: true },
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
        lifecycleStatus: 'active',
      },
      include: { customer: true, organization: true },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map(toDomain);
  }

  async listOpenByCustomerDomain(customerDomain: string): Promise<InquiryCase[]> {
    const domain = customerDomain.toLowerCase().trim();
    if (!canUseDomainForOrganizationMatching(domain)) {
      return [];
    }

    const records = await this.prisma.inquiryCase.findMany({
      where: {
        lifecycleStatus: 'active',
        OR: [
          { organization: { domain } },
          { customer: { domain } },
        ],
      },
      include: { customer: true, organization: true },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map(toDomain);
  }

  async list(): Promise<InquiryCase[]> {
    const records = await this.prisma.inquiryCase.findMany({
      include: { customer: true, organization: true },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map(toDomain);
  }

  private async resolveCustomerContact(input: EnsureCustomerContactInput) {
    const normalizedEmail = input.email.toLowerCase().trim();
    const domain = extractEmailDomain(normalizedEmail);
    const inferredCompanyName = inferCompanyNameFromEmailDomain(domain);
    const organization = await upsertOrganization(this.prisma, domain, input.name);
    const customer = await this.prisma.customer.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        name: input.name ?? null,
        domain: domain ?? null,
        companyName: inferredCompanyName ?? null,
        organizationId: organization?.id ?? null,
      },
      update: {
        name: input.name ?? undefined,
        domain: domain ?? undefined,
        organizationId: organization?.id ?? undefined,
      },
    });

    const updatedCustomer =
      inferredCompanyName && !customer.companyName
        ? await this.prisma.customer.update({
            where: { id: customer.id },
            data: { companyName: inferredCompanyName },
          })
        : customer;

    return { customer: updatedCustomer, organization, domain };
  }
}

async function upsertOrganization(
  prisma: PrismaService,
  domain: string | undefined,
  customerName?: string,
) {
  if (!canUseDomainForOrganizationMatching(domain)) {
    return undefined;
  }

  return prisma.organization.upsert({
    where: { domain },
    create: {
      domain,
      name: customerName ? `${domain} (${customerName})` : domain,
      source: 'email_domain',
    },
    update: {
      updatedAt: new Date(),
    },
  });
}

function toDomain(record: {
  id: string;
  businessStage: InquiryCase['businessStage'];
  actionOwner: InquiryCase['actionOwner'];
  lifecycleStatus: InquiryCase['lifecycleStatus'];
  stateVersion: number;
  subject: string | null;
  rawSubject?: string | null;
  businessSubject?: string | null;
  businessSubjectSource?: string | null;
  businessSubjectLocked?: boolean | null;
  businessSubjectUpdatedAt?: Date | null;
  organizationId?: string | null;
  primaryCustomerId?: string | null;
  latestMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { id?: string; email: string; name: string | null; domain?: string | null };
  organization?: { id: string; domain: string | null } | null;
}): InquiryCase {
  return {
    id: record.id,
    customerEmail: record.customer.email,
    customerName: record.customer.name ?? undefined,
    customerDomain: record.customer.domain ?? extractEmailDomain(record.customer.email),
    organizationId: record.organizationId ?? record.organization?.id ?? undefined,
    primaryCustomerId: record.primaryCustomerId ?? record.customer.id ?? undefined,
    subject: record.subject ?? '',
    rawSubject: record.rawSubject ?? record.subject ?? undefined,
    businessSubject: record.businessSubject ?? record.subject ?? undefined,
    businessSubjectSource: (record.businessSubjectSource as InquiryCase['businessSubjectSource']) ?? undefined,
    businessSubjectLocked: record.businessSubjectLocked ?? undefined,
    businessSubjectUpdatedAt: record.businessSubjectUpdatedAt ?? undefined,
    businessStage: record.businessStage,
    actionOwner: record.actionOwner,
    lifecycleStatus: record.lifecycleStatus,
    stateVersion: record.stateVersion,
    latestMessageAt: record.latestMessageAt ?? record.createdAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
