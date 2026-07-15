import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Query } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import {
  itemResponse,
  pageResponse,
  parseLimit,
  parsePage,
  toDateIso,
} from '../../../common/http/api-response.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { UpdateCustomerDto } from '../application/dto/update-customer.dto.js';
import {
  extractEmailDomain,
  inferCompanyNameFromEmailDomain,
} from '../domain/matching/email-domain-policy.js';
import { CustomerStatus } from '../domain/enums/customer-status.enum.js';

@Controller(API_ROUTE_SEGMENTS.customers)
export class CustomerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page') pageQuery?: string,
    @Query('limit') limitQuery?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const page = parsePage(pageQuery);
    const limit = parseLimit(limitQuery);
    const searchTerms = buildCustomerSearchTerms(q);
    const where = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(searchTerms.length > 0
        ? {
            OR: searchTerms.flatMap((term) => [
              { email: { contains: term, mode: 'insensitive' as const } },
              { name: { contains: term, mode: 'insensitive' as const } },
              { domain: { contains: term, mode: 'insensitive' as const } },
              { companyName: { contains: term, mode: 'insensitive' as const } },
              { organization: { name: { contains: term, mode: 'insensitive' as const } } },
              { organization: { domain: { contains: term, mode: 'insensitive' as const } } },
            ]),
          }
        : {}),
    };

    const [total, records] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: {
          organization: true,
          _count: {
            select: {
              inquiryCases: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return pageResponse({
      data: records.map(mapCustomer),
      total,
      page,
      limit,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        organization: true,
        inquiryCases: {
          where: { deletedAt: null },
          orderBy: [{ latestMessageAt: 'desc' }, { createdAt: 'desc' }],
          take: 20,
        },
        _count: {
          select: {
            inquiryCases: true,
          },
        },
      },
    });
    if (!record || record.deletedAt) throw new NotFoundException(`Customer not found: ${id}`);
    return itemResponse({
      ...mapCustomer(record),
      inquiryCases: record.inquiryCases.map((inquiry) => ({
        id: inquiry.id,
        businessStage: inquiry.businessStage,
        actionOwner: inquiry.actionOwner,
        lifecycleStatus: inquiry.lifecycleStatus,
        stateVersion: inquiry.stateVersion,
        subject: inquiry.subject,
        productType: inquiry.productType,
        latestMessageAt: toDateIso(inquiry.latestMessageAt),
        createdAt: toDateIso(inquiry.createdAt),
        updatedAt: toDateIso(inquiry.updatedAt),
      })),
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateCustomerDto) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException(`Customer not found: ${id}`);

    if (body.organizationId) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: body.organizationId },
      });
      if (!organization || organization.deletedAt) {
        throw new NotFoundException(`Organization not found: ${body.organizationId}`);
      }
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(body.organizationId !== undefined ? { organizationId: body.organizationId } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.companyName !== undefined ? { companyName: body.companyName } : {}),
        ...resolveCustomerStatusUpdate(body),
        ...(body.remark !== undefined ? { remark: body.remark } : {}),
        updatedAt: new Date(),
      },
      include: {
        organization: true,
        _count: {
          select: {
            inquiryCases: true,
          },
        },
      },
    });

    return itemResponse(mapCustomer(updated));
  }
}

function resolveCustomerStatusUpdate(body: UpdateCustomerDto) {
  if (body.status === undefined && body.invalidReason === undefined) {
    return {};
  }

  if (body.status !== undefined && !isCustomerStatus(body.status)) {
    throw new BadRequestException(`Invalid customer status: ${body.status}`);
  }

  if (body.status === CustomerStatus.INVALID) {
    return {
      status: body.status,
      invalidReason: normalizeNullableText(body.invalidReason),
      statusUpdatedAt: new Date(),
    };
  }

  if (body.status === CustomerStatus.ACTIVE || body.status === CustomerStatus.UNKNOWN) {
    return {
      status: body.status,
      invalidReason: null,
      statusUpdatedAt: new Date(),
    };
  }

  return {
    invalidReason: normalizeNullableText(body.invalidReason),
  };
}

function isCustomerStatus(value: string): value is CustomerStatus {
  return Object.values(CustomerStatus).includes(value as CustomerStatus);
}

function normalizeNullableText(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function buildCustomerSearchTerms(query: string | undefined): string[] {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const terms = new Set<string>([normalized]);
  const domain = normalized.includes('@')
    ? extractEmailDomain(normalized)
    : normalized.includes('.')
      ? normalized.replace(/^@/, '')
      : undefined;
  if (domain) {
    terms.add(domain);
    const companyName = inferCompanyNameFromEmailDomain(domain);
    if (companyName) {
      terms.add(companyName);
    }
  }

  return Array.from(terms);
}

function mapCustomer(record: any) {
  return {
    id: record.id,
    organizationId: record.organizationId,
    email: record.email,
    name: record.name,
    domain: record.domain,
    companyName: record.companyName,
    country: record.country,
    source: record.source,
    status: record.status,
    invalidReason: record.invalidReason,
    statusUpdatedAt: toDateIso(record.statusUpdatedAt),
    remark: record.remark,
    organization: record.organization
      ? {
          id: record.organization.id,
          name: record.organization.name,
          domain: record.organization.domain,
          status: record.organization.status,
          source: record.organization.source,
        }
      : null,
    createdAt: toDateIso(record.createdAt),
    updatedAt: toDateIso(record.updatedAt),
    counts: record._count ?? undefined,
  };
}
