import { Body, Controller, Get, NotFoundException, Param, Patch, Query } from '@nestjs/common';
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
    const where = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
              { domain: { contains: q, mode: 'insensitive' as const } },
              { companyName: { contains: q, mode: 'insensitive' as const } },
              { organization: { name: { contains: q, mode: 'insensitive' as const } } },
              { organization: { domain: { contains: q, mode: 'insensitive' as const } } },
            ],
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
        status: inquiry.status,
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
