import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import {
  itemResponse,
  pageResponse,
  parseLimit,
  parsePage,
  toDateIso,
} from '../../../common/http/api-response.js';
import { PrismaService } from '../../../common/database/prisma.service.js';

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
            ],
          }
        : {}),
    };

    const [total, records] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: {
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
}

function mapCustomer(record: any) {
  return {
    id: record.id,
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
    createdAt: toDateIso(record.createdAt),
    updatedAt: toDateIso(record.updatedAt),
    counts: record._count ?? undefined,
  };
}
