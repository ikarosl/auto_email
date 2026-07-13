import { PrismaService } from '../../../../common/database/prisma.service.js';
import { EmailAiAnalysis } from '../../../email/domain/value-objects/email-ai-analysis.vo.js';

export interface UpdateInquiryStructuredFactsFromAiInput {
  inquiryCaseId: string;
  emailMessageId: string;
  analysis: EmailAiAnalysis;
}

export class UpdateInquiryStructuredFactsFromAiUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: UpdateInquiryStructuredFactsFromAiInput): Promise<void> {
    if (input.analysis.classification !== 'valid_inquiry') return;

    const requirements = input.analysis.extractedRequirements;
    const existing = await this.prisma.inquiryStructuredFact.findUnique({
      where: { inquiryCaseId: input.inquiryCaseId },
      select: { sourceEmailMessageIds: true, confirmedFields: true },
    });
    const sourceIds = readStringArray(existing?.sourceEmailMessageIds);
    const sourceEmailMessageIds = Array.from(new Set([...sourceIds, input.emailMessageId]));
    const currentConfirmedFields = Object.entries(requirements)
      .filter(([, value]) => Boolean(value?.trim()))
      .map(([key]) => key);
    const confirmedFields = Array.from(new Set([
      ...readStringArray(existing?.confirmedFields),
      ...currentConfirmedFields,
    ]));
    const data = {
      productType: requirements.productType,
      frequencyRange: requirements.frequencyRange,
      power: requirements.power,
      quantity: requirements.quantity,
      sizeRequirement: requirements.sizeRequirement,
      application: requirements.application,
      missingFields: input.analysis.missingFields,
      confirmedFields,
      sourceEmailMessageIds,
      confidence: input.analysis.confidence,
      lastUpdatedBy: 'ai',
      updatedFromEmailMessageId: input.emailMessageId,
      updatedAt: new Date(),
    };

    await this.prisma.inquiryStructuredFact.upsert({
      where: { inquiryCaseId: input.inquiryCaseId },
      create: {
        inquiryCaseId: input.inquiryCaseId,
        ...data,
      },
      update: stripUndefined(data),
    });
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
