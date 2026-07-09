import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import {
  itemResponse,
  pageResponse,
  parseLimit,
  parsePage,
  toDateIso,
} from '../../../common/http/api-response.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { CreateInquiryDto } from '../application/dto/create-inquiry.dto.js';
import { LinkInquiryMessageDto } from '../application/dto/link-inquiry-message.dto.js';
import { TransitionInquiryStatusDto } from '../application/dto/transition-inquiry-status.dto.js';
import { UpdateInquiryDto } from '../application/dto/update-inquiry.dto.js';
import { CreateInquiryUseCase } from '../application/use-cases/create-inquiry.use-case.js';
import { InquiryMessageRelationType } from '../domain/enums/inquiry-message-relation-type.enum.js';
import { GetInquiryUseCase } from '../application/use-cases/get-inquiry.use-case.js';
import { ListAllowedTransitionsUseCase } from '../application/use-cases/list-allowed-transitions.use-case.js';
import { ListInquiriesUseCase } from '../application/use-cases/list-inquiries.use-case.js';
import { TransitionInquiryStatusUseCase } from '../application/use-cases/transition-inquiry-status.use-case.js';

@Controller(API_ROUTE_SEGMENTS.inquiries)
export class InquiryController {
  constructor(
    private readonly createInquiryUseCase: CreateInquiryUseCase,
    private readonly getInquiryUseCase: GetInquiryUseCase,
    private readonly listInquiriesUseCase: ListInquiriesUseCase,
    private readonly listAllowedTransitionsUseCase: ListAllowedTransitionsUseCase,
    private readonly transitionInquiryStatusUseCase: TransitionInquiryStatusUseCase,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(@Body() body: CreateInquiryDto) {
    const inquiryCase = await this.createInquiryUseCase.execute({
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      subject: body.subject,
      latestMessageAt: body.latestMessageAt ? new Date(body.latestMessageAt) : undefined,
    });

    return {
      success: true,
      data: inquiryCase,
      total: 1,
      page: 1,
      limit: 1,
    };
  }

  @Get()
  async list(
    @Query('page') pageQuery?: string,
    @Query('limit') limitQuery?: string,
    @Query('status') status?: string,
    @Query('customerEmail') customerEmail?: string,
    @Query('q') q?: string,
  ) {
    const page = parsePage(pageQuery);
    const limit = parseLimit(limitQuery);
    const where = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(customerEmail ? { customer: { email: { contains: customerEmail, mode: 'insensitive' as const } } } : {}),
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: 'insensitive' as const } },
              { rawSubject: { contains: q, mode: 'insensitive' as const } },
              { businessSubject: { contains: q, mode: 'insensitive' as const } },
              { productType: { contains: q, mode: 'insensitive' as const } },
              { customer: { email: { contains: q, mode: 'insensitive' as const } } },
              { customer: { name: { contains: q, mode: 'insensitive' as const } } },
              { customer: { companyName: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.inquiryCase.count({ where }),
      this.prisma.inquiryCase.findMany({
        where,
        include: {
          customer: true,
          organization: true,
          primaryCustomer: true,
          structuredFacts: true,
          _count: {
            select: {
              inquiryMessages: true,
              aiDecisions: true,
              replyDrafts: true,
              contextSnapshots: true,
              statusLogs: true,
            },
          },
        },
        orderBy: [{ latestMessageAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return pageResponse({
      data: records.map(mapInquiryCase),
      total,
      page,
      limit,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const [record, contextSummary] = await Promise.all([
      this.prisma.inquiryCase.findUnique({
        where: { id },
        include: {
          customer: true,
          organization: true,
          primaryCustomer: true,
          structuredFacts: true,
          statusLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
          _count: {
            select: {
              inquiryMessages: true,
              aiDecisions: true,
              replyDrafts: true,
              contextSnapshots: true,
              statusLogs: true,
            },
          },
        },
      }),
      this.prisma.$queryRaw<InquiryContextSummaryRecord[]>`
        SELECT *
        FROM inquiry_context_summaries
        WHERE inquiry_case_id = ${id}
        LIMIT 1
      `,
    ]);
    if (!record || record.deletedAt) throw new NotFoundException(`Inquiry not found: ${id}`);
    return itemResponse(mapInquiryCase({ ...record, contextSummary: mapInquiryContextSummary(contextSummary[0]) }));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateInquiryDto) {
    const existing = await this.prisma.inquiryCase.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException(`Inquiry not found: ${id}`);

    if (body.organizationId) {
      const organization = await this.prisma.organization.findUnique({ where: { id: body.organizationId } });
      if (!organization || organization.deletedAt) {
        throw new NotFoundException(`Organization not found: ${body.organizationId}`);
      }
    }

    if (body.primaryCustomerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: body.primaryCustomerId } });
      if (!customer || customer.deletedAt) {
        throw new NotFoundException(`Customer not found: ${body.primaryCustomerId}`);
      }
    }

    const updated = await this.prisma.inquiryCase.update({
      where: { id },
      data: {
        ...(body.businessSubject !== undefined
          ? {
              businessSubject: body.businessSubject,
              businessSubjectSource: 'human',
              businessSubjectUpdatedAt: new Date(),
            }
          : {}),
        ...(body.businessSubjectLocked !== undefined
          ? { businessSubjectLocked: body.businessSubjectLocked }
          : {}),
        ...(body.organizationId !== undefined ? { organizationId: body.organizationId } : {}),
        ...(body.primaryCustomerId !== undefined ? { primaryCustomerId: body.primaryCustomerId } : {}),
        ...(body.productType !== undefined ? { productType: body.productType } : {}),
        updatedAt: new Date(),
      },
      include: {
        customer: true,
        organization: true,
        primaryCustomer: true,
        structuredFacts: true,
        _count: {
          select: {
            inquiryMessages: true,
            aiDecisions: true,
            replyDrafts: true,
            contextSnapshots: true,
            statusLogs: true,
          },
        },
      },
    });

    return itemResponse(mapInquiryCase(updated));
  }

  @Get(':id/allowed-transitions')
  async allowedTransitions(@Param('id') id: string) {
    return itemResponse(await this.listAllowedTransitionsUseCase.execute(id));
  }

  @Post(':id/transitions')
  async transition(@Param('id') id: string, @Body() body: TransitionInquiryStatusDto) {
    const result = await this.transitionInquiryStatusUseCase.execute({
      inquiryCaseId: id,
      toStatus: body.toStatus,
      reason: body.reason,
      operatorType: body.operatorType,
      changedBy: body.changedBy,
    });

    return {
      success: true,
      data: {
        inquiryCaseId: result.inquiryCase.id,
        fromStatus: result.fromStatus,
        toStatus: result.toStatus,
        inquiryCase: result.inquiryCase,
      },
      total: 1,
      page: 1,
      limit: 1,
    };
  }

  @Post(':id/messages')
  async linkMessage(@Param('id') id: string, @Body() body: LinkInquiryMessageDto) {
    const inquiryCase = await this.prisma.inquiryCase.findUnique({ where: { id } });
    if (!inquiryCase || inquiryCase.deletedAt) throw new NotFoundException(`Inquiry not found: ${id}`);

    if (body.mode === 'create_manual_email') {
      throw new BadRequestException('Manual email creation is reserved for the next implementation batch.');
    }

    if (!body.emailMessageId) {
      throw new BadRequestException('emailMessageId is required when mode=link_existing_email.');
    }

    const emailMessage = await this.prisma.emailMessage.findUnique({ where: { id: body.emailMessageId } });
    if (!emailMessage || emailMessage.deletedAt) {
      throw new NotFoundException(`Email message not found: ${body.emailMessageId}`);
    }

    const now = new Date();
    const relationType = body.relationType ?? InquiryMessageRelationType.MANUAL_LINK;
    const record = await this.prisma.inquiryMessage.upsert({
      where: {
        inquiryCaseId_emailMessageId: {
          inquiryCaseId: id,
          emailMessageId: body.emailMessageId,
        },
      },
      create: {
        inquiryCaseId: id,
        emailMessageId: body.emailMessageId,
        direction: emailMessage.direction,
        relationType,
        createdByType: 'human',
        createdBy: body.changedBy ?? null,
        relationReason: body.relationReason ?? null,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        relationType,
        createdByType: 'human',
        createdBy: body.changedBy ?? null,
        relationReason: body.relationReason ?? null,
        updatedAt: now,
      },
      include: {
        emailMessage: true,
        inquiryCase: true,
      },
    });

    await this.prisma.inquiryCase.update({
      where: { id },
      data: {
        latestMessageAt: emailMessage.receivedAt,
        updatedAt: now,
      },
    });

    return itemResponse(mapInquiryMessage(record));
  }
}

interface InquiryContextSummaryRecord {
  id: string;
  inquiry_case_id: string;
  summary_text: string;
  known_facts_json: unknown;
  customer_decisions_json: unknown;
  our_commitments_json: unknown;
  open_questions_json: unknown;
  covered_email_ids_json: unknown;
  covered_message_count: number;
  covered_from: Date | null;
  covered_to: Date | null;
  created_at?: Date;
  updated_at: Date;
}

function mapInquiryCase(record: any) {
  return {
    id: record.id,
    customerId: record.customerId,
    organizationId: record.organizationId,
    primaryCustomerId: record.primaryCustomerId,
    status: record.status,
    subject: record.subject,
    rawSubject: record.rawSubject,
    businessSubject: record.businessSubject,
    businessSubjectSource: record.businessSubjectSource,
    businessSubjectLocked: record.businessSubjectLocked,
    businessSubjectUpdatedAt: toDateIso(record.businessSubjectUpdatedAt),
    productType: record.productType,
    latestMessageAt: toDateIso(record.latestMessageAt),
    closedAt: toDateIso(record.closedAt),
    createdAt: toDateIso(record.createdAt),
    updatedAt: toDateIso(record.updatedAt),
    customer: record.customer
      ? {
          id: record.customer.id,
          email: record.customer.email,
          name: record.customer.name,
          domain: record.customer.domain,
          companyName: record.customer.companyName,
          country: record.customer.country,
          source: record.customer.source,
          status: record.customer.status,
          invalidReason: record.customer.invalidReason,
          statusUpdatedAt: toDateIso(record.customer.statusUpdatedAt),
        }
      : null,
    organization: record.organization
      ? {
          id: record.organization.id,
          name: record.organization.name,
          domain: record.organization.domain,
          status: record.organization.status,
          source: record.organization.source,
          remark: record.organization.remark,
        }
      : null,
    primaryCustomer: record.primaryCustomer
      ? {
          id: record.primaryCustomer.id,
          email: record.primaryCustomer.email,
          name: record.primaryCustomer.name,
          domain: record.primaryCustomer.domain,
          companyName: record.primaryCustomer.companyName,
          status: record.primaryCustomer.status,
        }
      : null,
    structuredFacts: record.structuredFacts ?? null,
    contextSummary: record.contextSummary ?? null,
    statusLogs: record.statusLogs?.map((log: any) => ({
      id: log.id,
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      reason: log.reason,
      changedBy: log.changedBy,
      changedByType: log.changedByType,
      createdAt: toDateIso(log.createdAt),
    })),
    counts: record._count ?? undefined,
  };
}

function mapInquiryContextSummary(record: InquiryContextSummaryRecord | undefined) {
  if (!record) return null;
  return {
    id: record.id,
    inquiryCaseId: record.inquiry_case_id,
    summaryText: record.summary_text,
    knownFacts: record.known_facts_json,
    customerDecisions: record.customer_decisions_json,
    ourCommitments: record.our_commitments_json,
    openQuestions: record.open_questions_json,
    coveredEmailIds: record.covered_email_ids_json,
    coveredMessageCount: record.covered_message_count,
    coveredFrom: toDateIso(record.covered_from),
    coveredTo: toDateIso(record.covered_to),
    createdAt: toDateIso(record.created_at),
    updatedAt: toDateIso(record.updated_at),
  };
}

function mapInquiryMessage(record: any) {
  return {
    id: record.id,
    inquiryCaseId: record.inquiryCaseId,
    emailMessageId: record.emailMessageId,
    relationType: record.relationType,
    direction: record.direction,
    createdByType: record.createdByType,
    createdBy: record.createdBy,
    relationReason: record.relationReason,
    createdAt: toDateIso(record.createdAt),
    updatedAt: toDateIso(record.updatedAt),
    emailMessage: record.emailMessage
      ? {
          id: record.emailMessage.id,
          fromEmail: record.emailMessage.fromEmail,
          fromName: record.emailMessage.fromName,
          subject: record.emailMessage.subject,
          receivedAt: toDateIso(record.emailMessage.receivedAt),
        }
      : null,
    inquiryCase: record.inquiryCase
      ? {
          id: record.inquiryCase.id,
          status: record.inquiryCase.status,
          subject: record.inquiryCase.subject,
          businessSubject: record.inquiryCase.businessSubject,
        }
      : null,
  };
}
