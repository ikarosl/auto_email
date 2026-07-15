import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import {
  itemResponse,
  pageResponse,
  parseLimit,
  parsePage,
  toDateIso,
} from '../../../common/http/api-response.js';
import { PrismaService } from '../../../common/database/prisma.service.js';

@Controller(API_ROUTE_SEGMENTS.organizations)
export class OrganizationController {
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
              { name: { contains: q, mode: 'insensitive' as const } },
              { domain: { contains: q, mode: 'insensitive' as const } },
              { remark: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        include: {
          _count: {
            select: {
              customers: true,
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
      data: records.map(mapOrganization),
      total,
      page,
      limit,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        customers: {
          where: { deletedAt: null },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 50,
        },
        inquiryCases: {
          where: { deletedAt: null },
          include: {
            customer: true,
            primaryCustomer: true,
          },
          orderBy: [{ latestMessageAt: 'desc' }, { createdAt: 'desc' }],
          take: 50,
        },
        _count: {
          select: {
            customers: true,
            inquiryCases: true,
          },
        },
      },
    });
    if (!record || record.deletedAt) throw new NotFoundException(`Organization not found: ${id}`);

    return itemResponse({
      ...mapOrganization(record),
      customers: record.customers.map((customer) => ({
        id: customer.id,
        email: customer.email,
        name: customer.name,
        domain: customer.domain,
        companyName: customer.companyName,
        status: customer.status,
        invalidReason: customer.invalidReason,
        createdAt: toDateIso(customer.createdAt),
        updatedAt: toDateIso(customer.updatedAt),
      })),
      inquiryCases: record.inquiryCases.map((inquiry) => ({
        id: inquiry.id,
        customerId: inquiry.customerId,
        primaryCustomerId: inquiry.primaryCustomerId,
        businessStage: inquiry.businessStage,
        actionOwner: inquiry.actionOwner,
        lifecycleStatus: inquiry.lifecycleStatus,
        stateVersion: inquiry.stateVersion,
        subject: inquiry.subject,
        rawSubject: inquiry.rawSubject,
        businessSubject: inquiry.businessSubject,
        businessSubjectSource: inquiry.businessSubjectSource,
        businessSubjectLocked: inquiry.businessSubjectLocked,
        productType: inquiry.productType,
        latestMessageAt: toDateIso(inquiry.latestMessageAt),
        createdAt: toDateIso(inquiry.createdAt),
        updatedAt: toDateIso(inquiry.updatedAt),
        customer: inquiry.customer
          ? {
              id: inquiry.customer.id,
              email: inquiry.customer.email,
              name: inquiry.customer.name,
            }
          : null,
        primaryCustomer: inquiry.primaryCustomer
          ? {
              id: inquiry.primaryCustomer.id,
              email: inquiry.primaryCustomer.email,
              name: inquiry.primaryCustomer.name,
            }
          : null,
      })),
    });
  }

  @Post()
  async create(@Body() body: { name: string; domain?: string; remark?: string }) {
    const record = await this.prisma.organization.create({
      data: { name: body.name, domain: body.domain ?? null, remark: body.remark ?? null },
      include: { _count: { select: { customers: true, inquiryCases: true } } },
    });
    return itemResponse(mapOrganization(record));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; domain?: string; remark?: string; status?: string },
  ) {
    const existing = await this.prisma.organization.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException(`Organization not found: ${id}`);

    const record = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.domain !== undefined ? { domain: body.domain } : {}),
        ...(body.remark !== undefined ? { remark: body.remark } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: new Date(),
      },
      include: { _count: { select: { customers: true, inquiryCases: true } } },
    });
    return itemResponse(mapOrganization(record));
  }
}

function mapOrganization(record: any) {
  return {
    id: record.id,
    name: record.name,
    domain: record.domain,
    status: record.status,
    source: record.source,
    remark: record.remark,
    createdAt: toDateIso(record.createdAt),
    updatedAt: toDateIso(record.updatedAt),
    counts: record._count ?? undefined,
  };
}
