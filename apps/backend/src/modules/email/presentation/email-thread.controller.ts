import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import {
  itemResponse,
  pageResponse,
  parseLimit,
  parsePage,
  toDateIso,
  toNumber,
  toStringOrNull,
} from '../../../common/http/api-response.js';
import { PrismaService } from '../../../common/database/prisma.service.js';

@Controller(API_ROUTE_SEGMENTS.emailThreads)
export class EmailThreadController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page') pageQuery?: string,
    @Query('limit') limitQuery?: string,
    @Query('customerEmail') customerEmail?: string,
    @Query('q') q?: string,
  ) {
    const page = parsePage(pageQuery);
    const limit = parseLimit(limitQuery);
    const where = {
      ...(customerEmail ? { customerEmail: { contains: customerEmail, mode: 'insensitive' as const } } : {}),
      ...(q
        ? {
            OR: [
              { threadKey: { contains: q, mode: 'insensitive' as const } },
              { externalThreadId: { contains: q, mode: 'insensitive' as const } },
              { subjectNormalized: { contains: q, mode: 'insensitive' as const } },
              { customerEmail: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, records] = await Promise.all([
      this.prisma.emailThread.count({ where }),
      this.prisma.emailThread.findMany({
        where,
        include: {
          mailboxAccount: true,
          _count: {
            select: {
              emailMessages: true,
            },
          },
        },
        orderBy: [{ latestMessageAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return pageResponse({
      data: records.map(mapEmailThread),
      total,
      page,
      limit,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.prisma.emailThread.findUnique({
      where: { id },
      include: {
        mailboxAccount: true,
        _count: {
          select: {
            emailMessages: true,
          },
        },
      },
    });
    if (!record) throw new NotFoundException(`Email thread not found: ${id}`);
    return itemResponse(mapEmailThread(record));
  }

  @Get(':id/messages')
  async listMessages(
    @Param('id') id: string,
    @Query('page') pageQuery?: string,
    @Query('limit') limitQuery?: string,
  ) {
    const page = parsePage(pageQuery);
    const limit = parseLimit(limitQuery);
    const where = {
      emailThreadId: id,
      deletedAt: null,
    };
    const [total, records] = await Promise.all([
      this.prisma.emailMessage.count({ where }),
      this.prisma.emailMessage.findMany({
        where,
        include: {
          attachments: {
            orderBy: { createdAt: 'asc' },
          },
          inquiryMessages: {
            include: {
              inquiryCase: {
                select: {
                  id: true,
                  businessStage: true,
                  actionOwner: true,
                  lifecycleStatus: true,
                  subject: true,
                },
              },
            },
          },
          analysisDecisions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        } as any,
        orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return pageResponse({
      data: records.map(mapEmailMessage),
      total,
      page,
      limit,
    });
  }
}

function mapEmailThread(record: any) {
  return {
    id: record.id,
    mailboxAccountId: record.mailboxAccountId,
    mailboxEmail: record.mailboxAccount?.emailAddress ?? null,
    threadKey: record.threadKey,
    externalThreadId: record.externalThreadId,
    subjectNormalized: record.subjectNormalized,
    customerEmail: record.customerEmail,
    latestMessageAt: toDateIso(record.latestMessageAt),
    createdAt: toDateIso(record.createdAt),
    updatedAt: toDateIso(record.updatedAt),
    counts: record._count ?? undefined,
  };
}

function mapEmailMessage(record: any) {
  return {
    id: record.id,
    mailboxAccountId: record.mailboxAccountId,
    emailThreadId: record.emailThreadId,
    direction: record.direction,
    mailboxName: record.mailboxName,
    uidValidity: toStringOrNull(record.uidValidity),
    uid: toStringOrNull(record.uid),
    messageId: record.messageId,
    inReplyTo: record.inReplyTo,
    references: record.referencesJson,
    fromEmail: record.fromEmail,
    fromName: record.fromName,
    toEmails: record.toEmails,
    ccEmails: record.ccEmails,
    subject: record.subject,
    bodyText: record.bodyText,
    hasAttachments: record.hasAttachments,
    attachmentCount: record.attachmentCount,
    attachments: record.attachments?.map(mapEmailAttachment) ?? [],
    receivedAt: toDateIso(record.receivedAt),
    source: record.source,
    createdAt: toDateIso(record.createdAt),
    updatedAt: toDateIso(record.updatedAt),
    inquiryLinks: record.inquiryMessages?.map((link: any) => ({
      inquiryCaseId: link.inquiryCaseId,
      relationType: link.relationType,
      direction: link.direction,
      inquiryCase: link.inquiryCase,
    })),
    latestAnalysisDecision: record.analysisDecisions?.[0]
      ? {
          id: record.analysisDecisions[0].id,
          messageClassification: record.analysisDecisions[0].messageClassification,
          suggestedState: record.analysisDecisions[0].suggestedBusinessStage ? {
            businessStage: record.analysisDecisions[0].suggestedBusinessStage,
            actionOwner: record.analysisDecisions[0].suggestedActionOwner,
            lifecycleStatus: record.analysisDecisions[0].suggestedLifecycleStatus,
          } : null,
          confidence: toNumber(record.analysisDecisions[0].confidence),
          success: record.analysisDecisions[0].success,
          createdAt: toDateIso(record.analysisDecisions[0].createdAt),
        }
      : null,
  };
}

function mapEmailAttachment(record: any) {
  return {
    id: record.id,
    emailMessageId: record.emailMessageId,
    inquiryCaseId: record.inquiryCaseId,
    originalFileName: record.originalFileName,
    safeFileName: record.safeFileName,
    contentId: record.contentId,
    contentDisposition: record.contentDisposition,
    mimeType: record.mimeType,
    fileExtension: record.fileExtension,
    fileSize: toStringOrNull(record.fileSize),
    contentHash: record.contentHash,
    storageProvider: record.storageProvider,
    storagePath: record.storagePath,
    parseStatus: record.parseStatus,
    parseStrategy: record.parseStrategy,
    parsedTextPreview: record.parsedTextPreview,
    parsedTextLength: record.parsedTextLength,
    parseErrorCode: record.parseErrorCode,
    parseErrorMessage: record.parseErrorMessage,
    parsedAt: toDateIso(record.parsedAt),
    ocrStatus: record.ocrStatus,
    ocrProvider: record.ocrProvider,
    ocrTextPreview: record.ocrTextPreview,
    ocrErrorCode: record.ocrErrorCode,
    ocrAt: toDateIso(record.ocrAt),
    isInline: record.isInline,
    isContextCandidate: record.isContextCandidate,
    createdAt: toDateIso(record.createdAt),
    updatedAt: toDateIso(record.updatedAt),
  };
}
