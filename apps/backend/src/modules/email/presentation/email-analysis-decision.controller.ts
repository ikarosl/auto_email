import { Controller, Get, Query } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import {
  pageResponse,
  parseLimit,
  parsePage,
  toDateIso,
  toNumber,
} from '../../../common/http/api-response.js';
import { PrismaService } from '../../../common/database/prisma.service.js';

@Controller(API_ROUTE_SEGMENTS.emailAnalysisDecisions)
export class EmailAnalysisDecisionController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page') pageQuery?: string,
    @Query('limit') limitQuery?: string,
    @Query('inquiryCaseId') inquiryCaseId?: string,
    @Query('direction') direction?: string,
  ) {
    const page = parsePage(pageQuery);
    const limit = parseLimit(limitQuery);
    const where = {
      isEffective: true,
      ...(inquiryCaseId ? { inquiryCaseId } : {}),
      ...(['inbound', 'outbound'].includes(direction || '') ? { direction } : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.emailAnalysisDecision.count({ where }),
      this.prisma.emailAnalysisDecision.findMany({
        where,
        include: {
          emailMessage: { select: { id: true, fromEmail: true, subject: true, receivedAt: true } },
          inquiryCase: {
            select: {
              id: true,
              businessStage: true,
              actionOwner: true,
              lifecycleStatus: true,
              businessSubject: true,
            },
          },
          stateDecision: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return pageResponse({ data: records.map(mapDecision), total, page, limit });
  }
}

function mapDecision(record: any) {
  return {
    id: record.id,
    emailMessageId: record.emailMessageId,
    inquiryCaseId: record.inquiryCaseId,
    direction: record.direction,
    messageClassification: record.messageClassification,
    isInquiry: record.isInquiry,
    inquiryScope: record.inquiryScope,
    scopeRelationship: record.scopeRelationship,
    inquiryScopeConfidence: toNumber(record.inquiryScopeConfidence),
    detectedProducts: record.detectedProducts,
    isEffective: record.isEffective,
    suggestedState: record.suggestedBusinessStage ? {
      businessStage: record.suggestedBusinessStage,
      actionOwner: record.suggestedActionOwner,
      lifecycleStatus: record.suggestedLifecycleStatus,
    } : null,
    confidence: toNumber(record.confidence),
    riskLevel: record.riskLevel,
    reason: record.reason,
    missingFields: record.missingFields,
    extractedRequirements: record.extractedRequirements,
    quoteBoundaryDetected: record.quoteBoundaryDetected,
    humanReviewRequired: record.humanReviewRequired,
    nextAction: record.nextAction,
    success: record.success,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    modelName: record.modelName,
    promptVersion: record.promptVersion,
    createdAt: toDateIso(record.createdAt),
    emailMessage: record.emailMessage ? {
      ...record.emailMessage,
      receivedAt: toDateIso(record.emailMessage.receivedAt),
    } : null,
    inquiryCase: record.inquiryCase ?? null,
    stateDecision: record.stateDecision ? {
      id: record.stateDecision.id,
      executionStatus: record.stateDecision.executionStatus,
      executionReason: record.stateDecision.executionReason,
    } : null,
  };
}
