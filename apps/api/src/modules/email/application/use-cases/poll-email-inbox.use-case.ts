import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { InboundEmail } from '../../domain/value-objects/inbound-email.vo.js';
import {
  AnalyzeEmailWithAiResult,
  AnalyzeEmailWithAiUseCase,
} from './analyze-email-with-ai.use-case.js';
import { ReceiveInboundEmailUseCase } from './receive-inbound-email.use-case.js';
import {
  ProcessedEmailIdentity,
  ProcessedEmailTracker,
} from '../ports/processed-email-tracker.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { InquiryMessageRepository } from '../../../inquiry/application/ports/inquiry-message.repository.js';
import { EmailMessageRepository } from '../ports/email-message.repository.js';

export interface PollEmailCandidate {
  identity: ProcessedEmailIdentity;
  inboundEmail: InboundEmail;
}

export interface PollEmailProcessResult {
  skipped: boolean;
  identity: ProcessedEmailIdentity;
  emailMessage?: EmailMessage;
  inquiryCase?: InquiryCase;
  aiAnalysisResult?: AnalyzeEmailWithAiResult;
}

export class PollEmailInboxUseCase {
  constructor(
    private readonly processedEmailTracker: ProcessedEmailTracker,
    private readonly receiveInboundEmailUseCase: ReceiveInboundEmailUseCase,
    private readonly analyzeEmailWithAiUseCase?: AnalyzeEmailWithAiUseCase,
    private readonly inquiryMessageRepository?: InquiryMessageRepository,
    private readonly emailMessageRepository?: EmailMessageRepository,
  ) {}

  async markExistingSeen(candidates: PollEmailCandidate[]): Promise<void> {
    for (const candidate of candidates) {
      await this.processedEmailTracker.markSeen(candidate.identity);
    }
  }

  async processCandidate(candidate: PollEmailCandidate): Promise<PollEmailProcessResult> {
    if (await this.processedEmailTracker.hasProcessed(candidate.identity)) {
      return {
        skipped: true,
        identity: candidate.identity,
      };
    }

    const receiveResult = await this.receiveInboundEmailUseCase.execute(candidate.inboundEmail);
    const recentEmailMessages = await this.listInquiryEmailMessages(receiveResult.inquiryCase.id);
    const aiAnalysisResult = this.analyzeEmailWithAiUseCase
      ? await this.analyzeEmailWithAiUseCase.execute(receiveResult.emailMessage, {
        inquiryCase: receiveResult.inquiryCase,
        recentEmailMessages,
      })
      : undefined;

    await this.processedEmailTracker.markProcessed(candidate.identity);

    return {
      skipped: false,
      identity: candidate.identity,
      emailMessage: receiveResult.emailMessage,
      inquiryCase: receiveResult.inquiryCase,
      aiAnalysisResult,
    };
  }

  private async listInquiryEmailMessages(inquiryCaseId: string): Promise<EmailMessage[]> {
    if (!this.inquiryMessageRepository || !this.emailMessageRepository) {
      return [];
    }

    const inquiryMessages = await this.inquiryMessageRepository.listByInquiryCaseId(inquiryCaseId);
    const emailMessages = await Promise.all(
      inquiryMessages.map((inquiryMessage) =>
        this.emailMessageRepository?.findById(inquiryMessage.emailMessageId),
      ),
    );

    return emailMessages
      .filter((emailMessage): emailMessage is EmailMessage => Boolean(emailMessage))
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }
}
