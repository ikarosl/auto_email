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

@Controller(API_ROUTE_SEGMENTS.replyDrafts)
export class ReplyDraftController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page') pageQuery?: string,
    @Query('limit') limitQuery?: string,
    @Query('inquiryCaseId') inquiryCaseId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const page = parsePage(pageQuery);
    const limit = parseLimit(limitQuery);
    const where = {
      ...(inquiryCaseId ? { inquiryCaseId } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: 'insensitive' as const } },
              { bodyText: { contains: q, mode: 'insensitive' as const } },
              { inquiryCase: { subject: { contains: q, mode: 'insensitive' as const } } },
              { inquiryCase: { customer: { email: { contains: q, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.replyDraft.count({ where }),
      this.prisma.replyDraft.findMany({
        where,
        include: {
          inquiryCase: {
            select: {
              id: true,
              status: true,
              subject: true,
              customer: {
                select: {
                  email: true,
                  name: true,
                },
              },
            },
          },
          sourceEmailMessage: {
            select: {
              id: true,
              subject: true,
              receivedAt: true,
            },
          },
          sentEmailMessage: {
            select: {
              id: true,
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
      data: records.map(mapReplyDraft),
      total,
      page,
      limit,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.prisma.replyDraft.findUnique({
      where: { id },
      include: {
        inquiryCase: {
          select: {
            id: true,
            status: true,
            subject: true,
            customer: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        },
        sourceEmailMessage: {
          select: {
            id: true,
            subject: true,
            receivedAt: true,
          },
        },
        sentEmailMessage: {
          select: {
            id: true,
            subject: true,
            receivedAt: true,
          },
        },
      },
    });
    if (!record) throw new NotFoundException(`Reply draft not found: ${id}`);
    return itemResponse(mapReplyDraft(record));
  }
}

function mapReplyDraft(record: any) {
  return {
    id: record.id,
    inquiryCaseId: record.inquiryCaseId,
    sourceEmailMessageId: record.sourceEmailMessageId,
    sentEmailMessageId: record.sentEmailMessageId,
    draftType: record.draftType,
    status: record.status,
    subject: record.subject,
    bodyText: record.bodyText,
    modelName: record.modelName,
    createdByType: record.createdByType,
    createdAt: toDateIso(record.createdAt),
    updatedAt: toDateIso(record.updatedAt),
    inquiryCase: record.inquiryCase ?? null,
    sourceEmailMessage: record.sourceEmailMessage
      ? {
          ...record.sourceEmailMessage,
          receivedAt: toDateIso(record.sourceEmailMessage.receivedAt),
        }
      : null,
    sentEmailMessage: record.sentEmailMessage
      ? {
          ...record.sentEmailMessage,
          receivedAt: toDateIso(record.sentEmailMessage.receivedAt),
        }
      : null,
  };
}
