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

@Controller(API_ROUTE_SEGMENTS.contextSnapshots)
export class ContextSnapshotController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page') pageQuery?: string,
    @Query('limit') limitQuery?: string,
    @Query('inquiryCaseId') inquiryCaseId?: string,
    @Query('emailMessageId') emailMessageId?: string,
    @Query('purpose') purpose?: string,
  ) {
    const page = parsePage(pageQuery);
    const limit = parseLimit(limitQuery);
    const where = {
      ...(inquiryCaseId ? { inquiryCaseId } : {}),
      ...(emailMessageId ? { emailMessageId } : {}),
      ...(purpose ? { purpose } : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.aiContextSnapshot.count({ where }),
      this.prisma.aiContextSnapshot.findMany({
        where,
        include: {
          inquiryCase: {
            select: {
              id: true,
              status: true,
              subject: true,
            },
          },
          emailMessage: {
            select: {
              id: true,
              fromEmail: true,
              subject: true,
              receivedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return pageResponse({
      data: records.map(mapContextSnapshot),
      total,
      page,
      limit,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.prisma.aiContextSnapshot.findUnique({
      where: { id },
      include: {
        inquiryCase: {
          select: {
            id: true,
            status: true,
            subject: true,
          },
        },
        emailMessage: {
          select: {
            id: true,
            fromEmail: true,
            subject: true,
            receivedAt: true,
          },
        },
      },
    });
    if (!record) throw new NotFoundException(`Context snapshot not found: ${id}`);
    return itemResponse(mapContextSnapshot(record));
  }
}

function mapContextSnapshot(record: any) {
  return {
    id: record.id,
    inquiryCaseId: record.inquiryCaseId,
    emailMessageId: record.emailMessageId,
    purpose: record.purpose,
    contextPayload: record.contextPayloadJson,
    messages: record.messagesJson,
    sourceReferences: record.sourceReferences,
    estimatedTokens: record.estimatedTokens,
    modelName: record.modelName,
    createdAt: toDateIso(record.createdAt),
    inquiryCase: record.inquiryCase ?? null,
    emailMessage: record.emailMessage
      ? {
          ...record.emailMessage,
          receivedAt: toDateIso(record.emailMessage.receivedAt),
        }
      : null,
  };
}
