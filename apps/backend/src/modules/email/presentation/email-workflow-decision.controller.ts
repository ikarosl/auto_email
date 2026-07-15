import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { API_ROUTE_SEGMENTS } from '@email-inquiry/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { itemResponse, pageResponse, parseLimit, parsePage, toDateIso, toNumber } from '../../../common/http/api-response.js';
import { ReviewEmailWorkflowDecisionUseCase } from '../application/use-cases/review-email-workflow-decision.use-case.js';

@Controller()
export class EmailWorkflowDecisionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewUseCase: ReviewEmailWorkflowDecisionUseCase,
  ) {}

  @Get(`${API_ROUTE_SEGMENTS.inquiries}/:id/workflow-decisions`)
  async list(@Param('id') inquiryCaseId: string, @Query('page') pageValue?: string, @Query('limit') limitValue?: string) {
    const page = parsePage(pageValue);
    const limit = parseLimit(limitValue);
    const where = { inquiryCaseId };
    const [total, records] = await Promise.all([
      this.prisma.emailWorkflowDecision.count({ where }),
      this.prisma.emailWorkflowDecision.findMany({
        where,
        include: { emailMessage: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return pageResponse({ data: records.map(mapDecision), total, page, limit });
  }

  @Post(`${API_ROUTE_SEGMENTS.emailWorkflowDecisions}/:id/apply`)
  async apply(@Param('id') id: string, @Body() body: { reason?: string; changedBy?: string }) {
    return itemResponse(mapDecision(await this.reviewUseCase.apply(id, body)));
  }

  @Post(`${API_ROUTE_SEGMENTS.emailWorkflowDecisions}/:id/reject`)
  async reject(@Param('id') id: string, @Body() body: { reason: string; changedBy?: string }) {
    return itemResponse(mapDecision(await this.reviewUseCase.reject(id, body)));
  }
}

function mapDecision(record: any) {
  return record ? {
    id: record.id,
    emailMessageId: record.emailMessageId,
    inquiryCaseId: record.inquiryCaseId,
    aiDecisionId: record.aiDecisionId,
    direction: record.direction,
    source: record.source,
    eventType: record.eventType,
    responseExpected: record.responseExpected,
    suggestedStatus: record.suggestedStatus,
    confidence: toNumber(record.confidence),
    riskLevel: record.riskLevel,
    reason: record.reason,
    commercialBoundaryDetected: record.commercialBoundaryDetected,
    humanReviewRequired: record.humanReviewRequired,
    decisionSource: record.decisionSource,
    modelName: record.modelName,
    promptVersion: record.promptVersion,
    executionStatus: record.executionStatus,
    executionFromStatus: record.executionFromStatus,
    executionToStatus: record.executionToStatus,
    executionReason: record.executionReason,
    executedAt: toDateIso(record.executedAt),
    createdAt: toDateIso(record.createdAt),
    emailMessage: record.emailMessage ? {
      subject: record.emailMessage.subject,
      fromEmail: record.emailMessage.fromEmail,
      receivedAt: toDateIso(record.emailMessage.receivedAt),
    } : undefined,
  } : null;
}
