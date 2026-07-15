import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import { CreateInquiryDto } from '../application/dto/create-inquiry.dto.js';
import { UpdateInquiryDto } from '../application/dto/update-inquiry.dto.js';
import { ApplyInquiryStateDecisionUseCase } from '../application/use-cases/apply-inquiry-state-decision.use-case.js';
import { CreateInquiryUseCase } from '../application/use-cases/create-inquiry.use-case.js';
import { InquiryBusinessEventType } from '../domain/enums/inquiry-business-event.enum.js';
import {
  InquiryActionOwner,
  InquiryBusinessStage,
  InquiryLifecycleStatus,
  isValidInquiryState,
} from '../domain/enums/inquiry-state.enum.js';

const INQUIRY_INCLUDE = {
  customer: true,
  organization: true,
  primaryCustomer: true,
  structuredFacts: true,
  _count: {
    select: {
      inquiryMessages: true,
      analysisDecisions: true,
      replyDrafts: true,
      contextSnapshots: true,
      stateTransitions: true,
    },
  },
} as const;

@Controller(API_ROUTE_SEGMENTS.inquiries)
export class InquiryController {
  constructor(
    private readonly createInquiryUseCase: CreateInquiryUseCase,
    private readonly applyStateDecisionUseCase: ApplyInquiryStateDecisionUseCase,
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
    return itemResponse(inquiryCase);
  }

  @Get()
  async list(
    @Query('page') pageQuery?: string,
    @Query('limit') limitQuery?: string,
    @Query('businessStage') businessStage?: string,
    @Query('actionOwner') actionOwner?: string,
    @Query('lifecycleStatus') lifecycleStatus?: string,
    @Query('processingMode') processingMode?: string,
    @Query('customerEmail') customerEmail?: string,
    @Query('q') q?: string,
  ) {
    const page = parsePage(pageQuery);
    const limit = parseLimit(limitQuery);
    const where: any = {
      deletedAt: null,
      ...(businessStage ? { businessStage } : {}),
      ...(actionOwner ? { actionOwner } : {}),
      ...(lifecycleStatus ? { lifecycleStatus } : {}),
      ...(processingMode ? { processingMode } : {}),
      ...(customerEmail ? { customer: { email: { contains: customerEmail, mode: 'insensitive' } } } : {}),
      ...(q ? {
        OR: [
          { subject: { contains: q, mode: 'insensitive' } },
          { rawSubject: { contains: q, mode: 'insensitive' } },
          { businessSubject: { contains: q, mode: 'insensitive' } },
          { productType: { contains: q, mode: 'insensitive' } },
          { customer: { email: { contains: q, mode: 'insensitive' } } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { customer: { domain: { contains: q, mode: 'insensitive' } } },
          { customer: { companyName: { contains: q, mode: 'insensitive' } } },
          { organization: { domain: { contains: q, mode: 'insensitive' } } },
          { organization: { name: { contains: q, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.inquiryCase.count({ where }),
      this.prisma.inquiryCase.findMany({
        where,
        include: INQUIRY_INCLUDE,
        orderBy: [{ latestMessageAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return pageResponse({ data: records.map(mapInquiryCase), total, page, limit });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.prisma.inquiryCase.findUnique({
      where: { id },
      include: INQUIRY_INCLUDE,
    });
    if (!record || record.deletedAt) throw new NotFoundException(`Inquiry not found: ${id}`);
    return itemResponse(mapInquiryCase(record));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateInquiryDto) {
    await this.requireInquiry(id);
    if (body.organizationId) await this.requireOrganization(body.organizationId);
    if (body.primaryCustomerId) await this.requireCustomer(body.primaryCustomerId);

    const updated = await this.prisma.inquiryCase.update({
      where: { id },
      data: {
        ...(body.businessSubject !== undefined ? {
          businessSubject: body.businessSubject,
          businessSubjectSource: 'human',
          businessSubjectUpdatedAt: new Date(),
        } : {}),
        ...(body.businessSubjectLocked !== undefined ? { businessSubjectLocked: body.businessSubjectLocked } : {}),
        ...(body.organizationId !== undefined ? { organizationId: body.organizationId } : {}),
        ...(body.primaryCustomerId !== undefined ? { primaryCustomerId: body.primaryCustomerId } : {}),
        ...(body.productType !== undefined ? { productType: body.productType } : {}),
        updatedAt: new Date(),
      },
      include: INQUIRY_INCLUDE,
    });
    return itemResponse(mapInquiryCase(updated));
  }

  @Post(':id/state-corrections')
  async correctState(@Param('id') id: string, @Body() body: ManualStateCorrectionBody) {
    const inquiry = await this.requireInquiry(id);
    const target = parseState(body);
    if (!body.reason?.trim()) throw new BadRequestException('reason is required');
    if (!isValidInquiryState(target)) {
      throw new BadRequestException('won/lost/invalid inquiries must use actionOwner=none');
    }

    const now = new Date();
    const decisionId = `state_decision_${randomUUID()}`;
    await this.prisma.$transaction([
      this.prisma.inquiryBusinessEvent.create({
        data: {
          id: `business_event_${randomUUID()}`,
          inquiryCaseId: id,
          eventType: InquiryBusinessEventType.MANUAL_STATE_CORRECTED,
          actor: 'human',
          confidence: 1,
          evidence: body.reason.trim(),
          payloadJson: target,
          sourceType: 'human',
          occurredAt: now,
        },
      }),
      this.prisma.inquiryStateDecision.create({
        data: {
          id: decisionId,
          inquiryCaseId: id,
          beforeBusinessStage: inquiry.businessStage,
          beforeActionOwner: inquiry.actionOwner,
          beforeLifecycleStatus: inquiry.lifecycleStatus,
          beforeStateVersion: inquiry.stateVersion,
          suggestedBusinessStage: target.businessStage,
          suggestedActionOwner: target.actionOwner,
          suggestedLifecycleStatus: target.lifecycleStatus,
          confidence: 1,
          riskLevel: 'low',
          eventValidationPassed: true,
          humanReviewAdvisory: false,
          executionStatus: 'pending_review',
          executionReason: body.reason.trim(),
          policyVersion: 'manual-correction-v1',
          decisionSource: 'human',
          eventOccurredAt: now,
        },
      }),
    ]);
    const applied = await this.applyStateDecisionUseCase.applyPending(
      decisionId,
      body.changedBy || 'internal_admin',
      body.reason,
    );
    return itemResponse(mapStateDecision(applied));
  }

  @Get(':id/state-decisions')
  async stateDecisions(@Param('id') id: string, @Query('page') p?: string, @Query('limit') l?: string) {
    await this.requireInquiry(id);
    const page = parsePage(p);
    const limit = parseLimit(l);
    const where = { inquiryCaseId: id, isEffective: true };
    const [total, records] = await Promise.all([
      this.prisma.inquiryStateDecision.count({ where }),
      this.prisma.inquiryStateDecision.findMany({
        where,
        orderBy: [{ eventOccurredAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return pageResponse({ data: records.map(mapStateDecision), total, page, limit });
  }

  @Get(':id/business-events')
  async businessEvents(@Param('id') id: string, @Query('page') p?: string, @Query('limit') l?: string) {
    await this.requireInquiry(id);
    const page = parsePage(p);
    const limit = parseLimit(l);
    const where = { inquiryCaseId: id, isEffective: true };
    const [total, records] = await Promise.all([
      this.prisma.inquiryBusinessEvent.count({ where }),
      this.prisma.inquiryBusinessEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'asc' }, { sequenceInEmail: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return pageResponse({ data: records.map(mapBusinessEvent), total, page, limit });
  }

  @Get(':id/state-transitions')
  async stateTransitions(@Param('id') id: string, @Query('page') p?: string, @Query('limit') l?: string) {
    await this.requireInquiry(id);
    const page = parsePage(p);
    const limit = parseLimit(l);
    const where = { inquiryCaseId: id, isEffective: true };
    const [total, records] = await Promise.all([
      this.prisma.inquiryStateTransition.count({ where }),
      this.prisma.inquiryStateTransition.findMany({
        where,
        orderBy: [{ eventOccurredAt: 'asc' }, { processedAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return pageResponse({ data: records.map(mapStateTransition), total, page, limit });
  }

  @Get(':id/messages')
  async listMessages(
    @Param('id') id: string,
    @Query('page') p?: string,
    @Query('limit') l?: string,
    @Query('direction') direction?: string,
  ) {
    await this.requireInquiry(id);
    const page = parsePage(p);
    const limit = parseLimit(l);
    const where: any = {
      inquiryCaseId: id,
      ...(['inbound', 'outbound'].includes(direction || '') ? { emailMessage: { direction } } : {}),
    };
    const [total, records] = await Promise.all([
      this.prisma.inquiryMessage.count({ where }),
      this.prisma.inquiryMessage.findMany({
        where,
        include: {
          emailMessage: {
            include: { analysisDecisions: { where: { isEffective: true }, orderBy: { createdAt: 'desc' }, take: 1 }, attachments: true },
          },
        },
        orderBy: { emailMessage: { receivedAt: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return pageResponse({ data: records.map(mapInquiryMessage), total, page, limit });
  }

  @Get(':id/thread')
  async thread(@Param('id') id: string) {
    const inquiry = await this.prisma.inquiryCase.findUnique({ where: { id }, include: INQUIRY_INCLUDE });
    if (!inquiry || inquiry.deletedAt) throw new NotFoundException(`Inquiry not found: ${id}`);
    const [messages, latestAnalysisDecision, latestStateDecision, latestContextSnapshot, latestDraft] =
      await Promise.all([
        this.prisma.inquiryMessage.findMany({
          where: { inquiryCaseId: id },
          include: { emailMessage: { include: { attachments: true, analysisDecisions: { where: { isEffective: true } } } } },
          orderBy: { emailMessage: { receivedAt: 'asc' } },
        }),
        this.prisma.emailAnalysisDecision.findFirst({ where: { inquiryCaseId: id, isEffective: true }, orderBy: { createdAt: 'desc' } }),
        this.prisma.inquiryStateDecision.findFirst({ where: { inquiryCaseId: id, isEffective: true }, orderBy: { createdAt: 'desc' } }),
        this.prisma.aiContextSnapshot.findFirst({ where: { inquiryCaseId: id }, orderBy: { createdAt: 'desc' } }),
        this.prisma.replyDraft.findFirst({ where: { inquiryCaseId: id }, orderBy: { createdAt: 'desc' } }),
      ]);
    return itemResponse({
      inquiry: mapInquiryCase(inquiry),
      messages: messages.map(mapInquiryMessage),
      latestAnalysisDecision: latestAnalysisDecision ? mapAnalysisDecision(latestAnalysisDecision) : null,
      latestStateDecision: latestStateDecision ? mapStateDecision(latestStateDecision) : null,
      latestContextSnapshot: latestContextSnapshot ? {
        id: latestContextSnapshot.id,
        purpose: latestContextSnapshot.purpose,
        estimatedTokens: latestContextSnapshot.estimatedTokens,
        createdAt: toDateIso(latestContextSnapshot.createdAt),
      } : null,
      latestDraft: latestDraft ? {
        id: latestDraft.id,
        draftType: latestDraft.draftType,
        status: latestDraft.status,
        createdAt: toDateIso(latestDraft.createdAt),
      } : null,
    });
  }

  private async requireInquiry(id: string) {
    const inquiry = await this.prisma.inquiryCase.findUnique({ where: { id } });
    if (!inquiry || inquiry.deletedAt) throw new NotFoundException(`Inquiry not found: ${id}`);
    return inquiry;
  }

  private async requireOrganization(id: string) {
    const record = await this.prisma.organization.findUnique({ where: { id } });
    if (!record || record.deletedAt) throw new NotFoundException(`Organization not found: ${id}`);
  }

  private async requireCustomer(id: string) {
    const record = await this.prisma.customer.findUnique({ where: { id } });
    if (!record || record.deletedAt) throw new NotFoundException(`Customer not found: ${id}`);
  }
}

@Controller('inquiry-state-decisions')
export class InquiryStateDecisionController {
  constructor(private readonly applyStateDecisionUseCase: ApplyInquiryStateDecisionUseCase) {}

  @Post(':id/apply')
  async apply(@Param('id') id: string, @Body() body: { changedBy?: string; reason?: string }) {
    return itemResponse(mapStateDecision(
      await this.applyStateDecisionUseCase.applyPending(
        id,
        body.changedBy || 'internal_admin',
        body.reason,
      ),
    ));
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    if (!body.reason?.trim()) throw new BadRequestException('reason is required');
    return itemResponse(mapStateDecision(await this.applyStateDecisionUseCase.reject(id, body.reason.trim())));
  }
}

interface ManualStateCorrectionBody {
  businessStage?: string;
  actionOwner?: string;
  lifecycleStatus?: string;
  reason?: string;
  changedBy?: string;
}

function parseState(body: ManualStateCorrectionBody) {
  const stages = Object.values(InquiryBusinessStage) as string[];
  const owners = Object.values(InquiryActionOwner) as string[];
  const lifecycles = Object.values(InquiryLifecycleStatus) as string[];
  if (!body.businessStage || !stages.includes(body.businessStage)) throw new BadRequestException('invalid businessStage');
  if (!body.actionOwner || !owners.includes(body.actionOwner)) throw new BadRequestException('invalid actionOwner');
  if (!body.lifecycleStatus || !lifecycles.includes(body.lifecycleStatus)) throw new BadRequestException('invalid lifecycleStatus');
  return {
    businessStage: body.businessStage as InquiryBusinessStage,
    actionOwner: body.actionOwner as InquiryActionOwner,
    lifecycleStatus: body.lifecycleStatus as InquiryLifecycleStatus,
  };
}

function mapInquiryCase(record: any) {
  return {
    id: record.id,
    customerId: record.customerId,
    organizationId: record.organizationId,
    primaryCustomerId: record.primaryCustomerId,
    businessStage: record.businessStage,
    actionOwner: record.actionOwner,
    lifecycleStatus: record.lifecycleStatus,
    stateVersion: record.stateVersion,
    processingMode: record.processingMode,
    processingModeReason: record.processingModeReason,
    processingModeChangedAt: toDateIso(record.processingModeChangedAt),
    processingModeChangedBy: record.processingModeChangedBy,
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
    customer: record.customer ? {
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
    } : null,
    organization: record.organization ?? null,
    primaryCustomer: record.primaryCustomer ?? null,
    structuredFacts: record.structuredFacts ?? null,
    counts: record._count ?? undefined,
  };
}

function mapInquiryMessage(record: any) {
  const message = record.emailMessage;
  const latest = [...(message?.analysisDecisions ?? [])]
    .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return {
    inquiryMessageId: record.id,
    emailMessageId: record.emailMessageId,
    relationType: record.relationType,
    relationReason: record.relationReason,
    direction: record.direction,
    source: message?.source ?? null,
    fromEmail: message?.fromEmail ?? null,
    fromName: message?.fromName ?? null,
    toEmails: message?.toEmails ?? [],
    ccEmails: message?.ccEmails ?? [],
    subject: message?.subject ?? null,
    bodyText: message?.bodyText ?? null,
    receivedAt: toDateIso(message?.receivedAt),
    latestAnalysisDecision: latest ? mapAnalysisDecision(latest) : null,
    attachments: (message?.attachments ?? []).map((attachment: any) => ({
      ...attachment,
      fileSize: String(attachment.fileSize),
      createdAt: toDateIso(attachment.createdAt),
      updatedAt: toDateIso(attachment.updatedAt),
    })),
  };
}

function mapAnalysisDecision(record: any) {
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
    createdAt: toDateIso(record.createdAt),
  };
}

function mapBusinessEvent(record: any) {
  return {
    id: record.id,
    inquiryCaseId: record.inquiryCaseId,
    emailMessageId: record.emailMessageId,
    analysisDecisionId: record.analysisDecisionId,
    correctedEventId: record.correctedEventId,
    eventType: record.eventType,
    actor: record.actor,
    sequenceInEmail: record.sequenceInEmail,
    confidence: toNumber(record.confidence),
    evidence: record.evidence,
    payload: record.payloadJson,
    payloadJson: record.payloadJson,
    sourceType: record.sourceType,
    isEffective: record.isEffective,
    occurredAt: toDateIso(record.occurredAt),
    createdAt: toDateIso(record.createdAt),
  };
}

function mapStateDecision(record: any) {
  return {
    id: record.id,
    inquiryCaseId: record.inquiryCaseId,
    emailMessageId: record.emailMessageId,
    analysisDecisionId: record.analysisDecisionId,
    replayRunId: record.replayRunId,
    beforeState: {
      businessStage: record.beforeBusinessStage,
      actionOwner: record.beforeActionOwner,
      lifecycleStatus: record.beforeLifecycleStatus,
      stateVersion: record.beforeStateVersion,
    },
    beforeBusinessStage: record.beforeBusinessStage,
    beforeActionOwner: record.beforeActionOwner,
    beforeLifecycleStatus: record.beforeLifecycleStatus,
    beforeStateVersion: record.beforeStateVersion,
    suggestedState: {
      businessStage: record.suggestedBusinessStage,
      actionOwner: record.suggestedActionOwner,
      lifecycleStatus: record.suggestedLifecycleStatus,
    },
    suggestedBusinessStage: record.suggestedBusinessStage,
    suggestedActionOwner: record.suggestedActionOwner,
    suggestedLifecycleStatus: record.suggestedLifecycleStatus,
    appliedState: record.appliedBusinessStage ? {
      businessStage: record.appliedBusinessStage,
      actionOwner: record.appliedActionOwner,
      lifecycleStatus: record.appliedLifecycleStatus,
    } : null,
    appliedBusinessStage: record.appliedBusinessStage,
    appliedActionOwner: record.appliedActionOwner,
    appliedLifecycleStatus: record.appliedLifecycleStatus,
    confidence: toNumber(record.confidence),
    riskLevel: record.riskLevel,
    eventValidationPassed: record.eventValidationPassed,
    humanReviewAdvisory: record.humanReviewAdvisory,
    baselineIncomplete: record.baselineIncomplete,
    isEffective: record.isEffective,
    executionStatus: record.executionStatus,
    executionReason: record.executionReason,
    policyVersion: record.policyVersion,
    decisionSource: record.decisionSource,
    eventOccurredAt: toDateIso(record.eventOccurredAt),
    executedAt: toDateIso(record.executedAt),
    createdAt: toDateIso(record.createdAt),
  };
}

function mapStateTransition(record: any) {
  return {
    id: record.id,
    inquiryCaseId: record.inquiryCaseId,
    stateDecisionId: record.stateDecisionId,
    fromState: {
      businessStage: record.fromBusinessStage,
      actionOwner: record.fromActionOwner,
      lifecycleStatus: record.fromLifecycleStatus,
    },
    fromBusinessStage: record.fromBusinessStage,
    fromActionOwner: record.fromActionOwner,
    fromLifecycleStatus: record.fromLifecycleStatus,
    toState: {
      businessStage: record.toBusinessStage,
      actionOwner: record.toActionOwner,
      lifecycleStatus: record.toLifecycleStatus,
    },
    toBusinessStage: record.toBusinessStage,
    toActionOwner: record.toActionOwner,
    toLifecycleStatus: record.toLifecycleStatus,
    changedDimensions: record.changedDimensionsJson,
    changedDimensionsJson: record.changedDimensionsJson,
    reason: record.reason,
    changedBy: record.changedBy,
    changedByType: record.changedByType,
    isEffective: record.isEffective,
    eventOccurredAt: toDateIso(record.eventOccurredAt),
    processedAt: toDateIso(record.processedAt),
  };
}
