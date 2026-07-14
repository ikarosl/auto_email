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
import { GenerateReplyDraftUseCase } from '../application/use-cases/generate-reply-draft.use-case.js';
import { ManageReplyDraftUseCase } from '../application/use-cases/manage-reply-draft.use-case.js';
import { SendApprovedReplyUseCase } from '../application/use-cases/send-approved-reply.use-case.js';

@Controller(API_ROUTE_SEGMENTS.replyDrafts)
export class ReplyDraftController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generateReplyDraftUseCase: GenerateReplyDraftUseCase,
    private readonly manageReplyDraftUseCase: ManageReplyDraftUseCase,
    private readonly sendApprovedReplyUseCase: SendApprovedReplyUseCase,
  ) {}

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
          attachments: { include: { emailAttachment: true } },
          sendAttempts: { orderBy: { startedAt: 'desc' as const } },
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
        attachments: { include: { emailAttachment: true } },
        sendAttempts: { orderBy: { startedAt: 'desc' } },
      },
    });
    if (!record) throw new NotFoundException(`Reply draft not found: ${id}`);
    return itemResponse(mapReplyDraft(record));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { version: number; subject: string; bodyText: string; attachmentIds?: string[] },
  ) {
    return itemResponse(await this.manageReplyDraftUseCase.update({ replyDraftId: id, ...body }));
  }

  @Post(':id/regenerate')
  async regenerate(
    @Param('id') id: string,
    @Body() body: { commercialTerms?: string; operator?: string } = {},
  ) {
    const draft = await this.prisma.replyDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException(`Reply draft not found: ${id}`);
    return itemResponse(await this.generateReplyDraftUseCase.execute({
      inquiryCaseId: draft.inquiryCaseId,
      sourceEmailMessageId: draft.sourceEmailMessageId ?? undefined,
      aiDecisionId: draft.aiDecisionId ?? undefined,
      commercialTerms: body.commercialTerms,
      initiatedBy: body.operator,
      regenerate: true,
    }));
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Body() body: { operator?: string } = {}) {
    return itemResponse(await this.manageReplyDraftUseCase.approve(id, body.operator));
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { reason: string; operator?: string },
  ) {
    return itemResponse(await this.manageReplyDraftUseCase.reject(id, body.reason, body.operator));
  }

  @Post(':id/send')
  async send(@Param('id') id: string, @Body() body: { operator?: string } = {}) {
    return itemResponse(await this.sendApprovedReplyUseCase.execute({
      replyDraftId: id,
      initiatedBy: body.operator,
    }));
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
    contextSnapshotId: record.contextSnapshotId,
    aiDecisionId: record.aiDecisionId,
    language: record.language,
    usedFacts: record.usedFactsJson,
    unresolvedQuestions: record.unresolvedQuestionsJson,
    warnings: record.warningsJson,
    requiresCommercialReview: record.requiresCommercialReview,
    promptVersion: record.promptVersion,
    version: record.version,
    approvedBy: record.approvedBy,
    approvedAt: toDateIso(record.approvedAt),
    rejectedBy: record.rejectedBy,
    rejectedAt: toDateIso(record.rejectedAt),
    rejectionReason: record.rejectionReason,
    sentAt: toDateIso(record.sentAt),
    lastSendError: record.lastSendError,
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
    attachments: (record.attachments ?? []).map((item: any) => item.emailAttachment),
    sendAttempts: (record.sendAttempts ?? []).map((attempt: any) => ({
      ...attempt,
      startedAt: toDateIso(attempt.startedAt),
      completedAt: toDateIso(attempt.completedAt),
      createdAt: toDateIso(attempt.createdAt),
    })),
  };
}
