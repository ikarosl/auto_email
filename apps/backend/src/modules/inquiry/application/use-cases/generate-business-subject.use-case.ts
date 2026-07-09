import { EmailMessage } from '../../../email/domain/entities/email-message.entity.js';
import { BusinessSubjectGeneratorAdapter } from '../ports/business-subject-generator.adapter.js';
import { InquiryRepository } from '../ports/inquiry.repository.js';
import { businessSubjectSchema } from '../dto/business-subject.schema.js';

export interface GenerateBusinessSubjectInput {
  inquiryCaseId: string;
  currentEmail: EmailMessage;
  knownFacts: {
    productType?: string;
    frequencyRange?: string;
    quantity?: string;
  };
}

export class GenerateBusinessSubjectUseCase {
  constructor(
    private readonly inquiryRepository: InquiryRepository,
    private readonly businessSubjectGenerator: BusinessSubjectGeneratorAdapter,
  ) {}

  async execute(input: GenerateBusinessSubjectInput): Promise<void> {
    const inquiryCase = await this.inquiryRepository.findById(input.inquiryCaseId);
    if (!inquiryCase) return;

    // 跳过：人工锁定的业务主题不覆盖
    if (inquiryCase.businessSubjectLocked) return;

    // 跳过：人工设置的主题也不覆盖
    if (inquiryCase.businessSubjectSource === 'human') return;

    const rawOutput = await this.businessSubjectGenerator.generate({
      inquiryCase,
      currentEmail: input.currentEmail,
      knownFacts: input.knownFacts,
    });

    if (!rawOutput) return;

    try {
      const parsed = JSON.parse(rawOutput);
      const validated = businessSubjectSchema.parse(parsed);

      // 低置信度不覆盖
      if (validated.confidence < 0.5) return;

      const updated: typeof inquiryCase = {
        ...inquiryCase,
        businessSubject: validated.businessSubject,
        businessSubjectSource: 'ai_generated',
        businessSubjectUpdatedAt: new Date(),
        updatedAt: new Date(),
      };

      await this.inquiryRepository.save(updated);
    } catch {
      // AI 生成失败不阻断主流程
    }
  }
}
