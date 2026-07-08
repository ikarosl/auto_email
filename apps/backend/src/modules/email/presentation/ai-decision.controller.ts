import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import {
  itemResponse,
  pageResponse,
  parseLimit,
  parsePage,
  toDateIso,
  toNumber,
} from '../../../common/http/api-response.js';
import { PrismaService } from '../../../common/database/prisma.service.js';

@Controller(API_ROUTE_SEGMENTS.aiDecisions)
export class AiDecisionController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page') pageQuery?: string,
    @Query('limit') limitQuery?: string,
    @Query('inquiryCaseId') inquiryCaseId?: string,
    @Query('emailMessageId') emailMessageId?: string,
    @Query('classification') classification?: string,
    @Query('success') successQuery?: string,
  ) {
    const page = parsePage(pageQuery);
    const limit = parseLimit(limitQuery);
    const where = {
      ...(inquiryCaseId ? { inquiryCaseId } : {}),
      ...(emailMessageId ? { emailMessageId } : {}),
      ...(classification ? { classification } : {}),
      ...(successQuery === undefined ? {} : { success: successQuery === 'true' }),
    };
    const [total, records] = await Promise.all([
      this.prisma.aiDecision.count({ where }),
      this.prisma.aiDecision.findMany({
        where,
        include: {
          emailMessage: {
            select: {
              id: true,
              fromEmail: true,
              subject: true,
              receivedAt: true,
            },
          },
          inquiryCase: {
            select: {
              id: true,
              status: true,
              subject: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return pageResponse({
      data: records.map(mapAiDecision),
      total,
      page,
      limit,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.prisma.aiDecision.findUnique({
      where: { id },
      include: {
        emailMessage: {
          select: {
            id: true,
            fromEmail: true,
            fromName: true,
            subject: true,
            receivedAt: true,
          },
        },
        inquiryCase: {
          select: {
            id: true,
            status: true,
            subject: true,
          },
        },
      },
    });
    if (!record) throw new NotFoundException(`AI decision not found: ${id}`);
    return itemResponse(mapAiDecision(record));
  }
}

function mapAiDecision(record: any) {
  return {
    id: record.id,
    emailMessageId: record.emailMessageId,
    inquiryCaseId: record.inquiryCaseId,
    classification: record.classification,
    suggestedStatus: record.suggestedStatus,
    confidence: toNumber(record.confidence),
    riskLevel: record.riskLevel,
    reason: record.reason,
    missingFields: record.missingFields,
    extractedRequirements: record.extractedRequirements,
    quoteBoundaryDetected: record.quoteBoundaryDetected,
    humanReviewRequired: record.humanReviewRequired,
    nextAction: record.nextAction,
    rawResult: record.rawResult,
    modelName: record.modelName,
    success: record.success,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    createdAt: toDateIso(record.createdAt),
    emailMessage: record.emailMessage
      ? {
          ...record.emailMessage,
          receivedAt: toDateIso(record.emailMessage.receivedAt),
        }
      : null,
    inquiryCase: record.inquiryCase ?? null,
  };
}
