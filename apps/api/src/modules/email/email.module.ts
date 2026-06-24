import { Module } from '@nestjs/common';

import { BuildAiContextUseCase } from '../context/application/use-cases/build-ai-context.use-case.js';
import { ContextModule } from '../context/context.module.js';
import { FindInquiryForInboundEmailUseCase } from '../inquiry/application/use-cases/find-inquiry-for-inbound-email.use-case.js';
import { CreateInquiryFromEmailUseCase } from '../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { InquiryMessageRepository } from '../inquiry/application/ports/inquiry-message.repository.js';
import { InquiryRepository } from '../inquiry/application/ports/inquiry.repository.js';
import { INQUIRY_MESSAGE_REPOSITORY, INQUIRY_REPOSITORY } from '../inquiry/inquiry.tokens.js';
import { InquiryModule } from '../inquiry/inquiry.module.js';
import { ReceiveInboundEmailUseCase } from './application/use-cases/receive-inbound-email.use-case.js';
import { AnalyzeEmailWithAiUseCase } from './application/use-cases/analyze-email-with-ai.use-case.js';
import { PollEmailInboxUseCase } from './application/use-cases/poll-email-inbox.use-case.js';
import { EmailMessageRepository } from './application/ports/email-message.repository.js';
import { EmailAiAnalysisAdapter } from './application/ports/email-ai-analysis.adapter.js';
import { ProcessedEmailTracker } from './application/ports/processed-email-tracker.js';
import { DeepseekEmailAnalysisAdapter } from './infrastructure/adapters/deepseek-email-analysis.adapter.js';
import { InMemoryEmailMessageRepository } from './infrastructure/repositories/in-memory-email-message.repository.js';
import { InMemoryProcessedEmailTracker } from './infrastructure/repositories/in-memory-processed-email-tracker.js';
import { EmailWebhookController } from './presentation/email-webhook.controller.js';
import { EMAIL_AI_ANALYSIS_ADAPTER, EMAIL_MESSAGE_REPOSITORY, PROCESSED_EMAIL_TRACKER } from './email.tokens.js';

@Module({
  imports: [InquiryModule, ContextModule],
  controllers: [EmailWebhookController],
  providers: [
    {
      provide: EMAIL_MESSAGE_REPOSITORY,
      useClass: InMemoryEmailMessageRepository,
    },
    {
      provide: EMAIL_AI_ANALYSIS_ADAPTER,
      useClass: DeepseekEmailAnalysisAdapter,
    },
    {
      provide: PROCESSED_EMAIL_TRACKER,
      useClass: InMemoryProcessedEmailTracker,
    },
    {
      provide: ReceiveInboundEmailUseCase,
      useFactory: (
        emailMessageRepository: EmailMessageRepository,
        createInquiryFromEmailUseCase: CreateInquiryFromEmailUseCase,
        inquiryRepository: InquiryRepository,
        inquiryMessageRepository: InquiryMessageRepository,
      ) => {
        const findInquiryForInboundEmailUseCase = new FindInquiryForInboundEmailUseCase(
          inquiryRepository,
          inquiryMessageRepository,
          emailMessageRepository,
        );

        return new ReceiveInboundEmailUseCase(
          emailMessageRepository,
          createInquiryFromEmailUseCase,
          findInquiryForInboundEmailUseCase,
          inquiryMessageRepository,
        );
      },
      inject: [
        EMAIL_MESSAGE_REPOSITORY,
        CreateInquiryFromEmailUseCase,
        INQUIRY_REPOSITORY,
        INQUIRY_MESSAGE_REPOSITORY,
      ],
    },
    {
      provide: AnalyzeEmailWithAiUseCase,
      useFactory: (
        emailAiAnalysisAdapter: EmailAiAnalysisAdapter,
        buildAiContextUseCase: BuildAiContextUseCase,
      ) => new AnalyzeEmailWithAiUseCase(emailAiAnalysisAdapter, buildAiContextUseCase),
      inject: [EMAIL_AI_ANALYSIS_ADAPTER, BuildAiContextUseCase],
    },
    {
      provide: PollEmailInboxUseCase,
      useFactory: (
        processedEmailTracker: ProcessedEmailTracker,
        receiveInboundEmailUseCase: ReceiveInboundEmailUseCase,
        analyzeEmailWithAiUseCase: AnalyzeEmailWithAiUseCase,
        inquiryMessageRepository: InquiryMessageRepository,
        emailMessageRepository: EmailMessageRepository,
      ) => new PollEmailInboxUseCase(
        processedEmailTracker,
        receiveInboundEmailUseCase,
        analyzeEmailWithAiUseCase,
        inquiryMessageRepository,
        emailMessageRepository,
      ),
      inject: [
        PROCESSED_EMAIL_TRACKER,
        ReceiveInboundEmailUseCase,
        AnalyzeEmailWithAiUseCase,
        INQUIRY_MESSAGE_REPOSITORY,
        EMAIL_MESSAGE_REPOSITORY,
      ],
    },
  ],
})
export class EmailModule {}
