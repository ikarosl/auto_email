import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';
import { BuildAiContextUseCase } from '../context/application/use-cases/build-ai-context.use-case.js';
import { ContextModule } from '../context/context.module.js';
import { FindInquiryForInboundEmailUseCase } from '../inquiry/application/use-cases/find-inquiry-for-inbound-email.use-case.js';
import { CreateInquiryFromEmailUseCase } from '../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { UpdateCustomerStatusFromAiAnalysisUseCase } from '../inquiry/application/use-cases/update-customer-status-from-ai-analysis.use-case.js';
import { ApplyAiSuggestedStatusUseCase } from '../inquiry/application/use-cases/apply-ai-suggested-status.use-case.js';
import { UpdateInquiryStructuredFactsFromAiUseCase } from '../inquiry/application/use-cases/update-inquiry-structured-facts-from-ai.use-case.js';
import { GenerateBusinessSubjectUseCase } from '../inquiry/application/use-cases/generate-business-subject.use-case.js';
import { InquiryMessageRepository } from '../inquiry/application/ports/inquiry-message.repository.js';
import { InquiryRepository } from '../inquiry/application/ports/inquiry.repository.js';
import { INQUIRY_MESSAGE_REPOSITORY, INQUIRY_REPOSITORY } from '../inquiry/inquiry.tokens.js';
import { InquiryModule } from '../inquiry/inquiry.module.js';
import { ReceiveInboundEmailUseCase } from './application/use-cases/receive-inbound-email.use-case.js';
import { SaveEmailAttachmentsUseCase } from './application/use-cases/save-email-attachments.use-case.js';
import { AnalyzeEmailWithAiUseCase } from './application/use-cases/analyze-email-with-ai.use-case.js';
import { PollEmailInboxUseCase } from './application/use-cases/poll-email-inbox.use-case.js';
import { EmailMessageRepository } from './application/ports/email-message.repository.js';
import { EmailAttachmentRepository } from './application/ports/email-attachment.repository.js';
import { AttachmentStorageAdapter } from './application/ports/attachment-storage.adapter.js';
import { AttachmentParserAdapter } from './application/ports/attachment-parser.adapter.js';
import { AttachmentAiReaderAdapter } from './application/ports/attachment-ai-reader.adapter.js';
import { EmailAiAnalysisAdapter } from './application/ports/email-ai-analysis.adapter.js';
import { AiDecisionRepository } from './application/ports/ai-decision.repository.js';
import { EmailThreadRepository } from './application/ports/email-thread.repository.js';
import { ProcessedEmailTracker } from './application/ports/processed-email-tracker.js';
import { AiInteractionDebugLogger } from './application/ports/ai-interaction-debug-logger.js';
import { DeepseekEmailAnalysisAdapter } from './infrastructure/adapters/deepseek-email-analysis.adapter.js';
import { BasicAttachmentParserAdapter } from './infrastructure/adapters/basic-attachment-parser.adapter.js';
import { LocalAttachmentStorageAdapter } from './infrastructure/adapters/local-attachment-storage.adapter.js';
import { NoopAttachmentAiReaderAdapter } from './infrastructure/adapters/noop-attachment-ai-reader.adapter.js';
import { OpenAiAttachmentAiReaderAdapter } from './infrastructure/adapters/openai-attachment-ai-reader.adapter.js';
import { PrismaEmailAttachmentRepository } from './infrastructure/repositories/prisma-email-attachment.repository.js';
import { PrismaEmailMessageRepository } from './infrastructure/repositories/prisma-email-message.repository.js';
import { PrismaEmailThreadRepository } from './infrastructure/repositories/prisma-email-thread.repository.js';
import { PrismaProcessedEmailTracker } from './infrastructure/repositories/prisma-processed-email-tracker.js';
import { PrismaAiDecisionRepository } from './infrastructure/repositories/prisma-ai-decision.repository.js';
import { MailboxSyncService } from './infrastructure/services/mailbox-sync.service.js';
import { ImapPollService } from './infrastructure/services/imap-poll.service.js';
import { FileAiInteractionDebugLogger } from './infrastructure/services/file-ai-interaction-debug-logger.js';
import { AiDecisionController } from './presentation/ai-decision.controller.js';
import { EmailThreadController } from './presentation/email-thread.controller.js';
import { EmailWebhookController } from './presentation/email-webhook.controller.js';
import { ReplyDraftController } from './presentation/reply-draft.controller.js';
import { MessageController } from './presentation/message.controller.js';
import {
  AI_DECISION_REPOSITORY,
  ATTACHMENT_AI_READER_ADAPTER,
  ATTACHMENT_PARSER_ADAPTER,
  ATTACHMENT_STORAGE_ADAPTER,
  EMAIL_ATTACHMENT_REPOSITORY,
  EMAIL_AI_ANALYSIS_ADAPTER,
  EMAIL_MESSAGE_REPOSITORY,
  EMAIL_THREAD_REPOSITORY,
  PROCESSED_EMAIL_TRACKER,
} from './email.tokens.js';

@Module({
  imports: [InquiryModule, ContextModule],
  controllers: [EmailWebhookController, EmailThreadController, AiDecisionController, ReplyDraftController, MessageController],
  providers: [
    {
      provide: EMAIL_MESSAGE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaEmailMessageRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: EMAIL_ATTACHMENT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaEmailAttachmentRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ATTACHMENT_STORAGE_ADAPTER,
      useClass: LocalAttachmentStorageAdapter,
    },
    {
      provide: ATTACHMENT_PARSER_ADAPTER,
      useFactory: (aiReaderAdapter: AttachmentAiReaderAdapter) =>
        new BasicAttachmentParserAdapter(aiReaderAdapter),
      inject: [ATTACHMENT_AI_READER_ADAPTER],
    },
    {
      provide: ATTACHMENT_AI_READER_ADAPTER,
      useFactory: () => {
        const enabled = ['1', 'true', 'yes', 'on'].includes(
          (process.env.ATTACHMENT_AI_READER_ENABLED || 'false').toLowerCase(),
        );
        const provider = (process.env.ATTACHMENT_AI_READER_PROVIDER || 'openai').toLowerCase();
        if (enabled && provider === 'openai') {
          return new OpenAiAttachmentAiReaderAdapter();
        }
        return new NoopAttachmentAiReaderAdapter();
      },
    },
    {
      provide: MailboxSyncService,
      useFactory: (prisma: PrismaService) => new MailboxSyncService(prisma),
      inject: [PrismaService],
    },
    {
      provide: ImapPollService,
      useFactory: (
        prisma: PrismaService,
        pollUseCase: PollEmailInboxUseCase,
        syncService: MailboxSyncService,
        analyzeEmailWithAiUseCase: AnalyzeEmailWithAiUseCase,
      ) => new ImapPollService(prisma, pollUseCase, syncService, analyzeEmailWithAiUseCase),
      inject: [PrismaService, PollEmailInboxUseCase, MailboxSyncService, AnalyzeEmailWithAiUseCase],
    },
    {
      provide: AI_DECISION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaAiDecisionRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: EMAIL_AI_ANALYSIS_ADAPTER,
      useClass: DeepseekEmailAnalysisAdapter,
    },
    {
      provide: FileAiInteractionDebugLogger,
      useClass: FileAiInteractionDebugLogger,
    },
    {
      provide: EMAIL_THREAD_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaEmailThreadRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: PROCESSED_EMAIL_TRACKER,
      useFactory: (prisma: PrismaService) => new PrismaProcessedEmailTracker(prisma),
      inject: [PrismaService],
    },
    {
      provide: SaveEmailAttachmentsUseCase,
      useFactory: (
        attachmentRepository: EmailAttachmentRepository,
        storageAdapter: AttachmentStorageAdapter,
        parserAdapter: AttachmentParserAdapter,
        emailMessageRepository: EmailMessageRepository,
      ) => new SaveEmailAttachmentsUseCase(
        attachmentRepository,
        storageAdapter,
        parserAdapter,
        emailMessageRepository,
      ),
      inject: [
        EMAIL_ATTACHMENT_REPOSITORY,
        ATTACHMENT_STORAGE_ADAPTER,
        ATTACHMENT_PARSER_ADAPTER,
        EMAIL_MESSAGE_REPOSITORY,
      ],
    },
    {
      provide: ReceiveInboundEmailUseCase,
      useFactory: (
        emailMessageRepository: EmailMessageRepository,
        createInquiryFromEmailUseCase: CreateInquiryFromEmailUseCase,
        emailThreadRepository: EmailThreadRepository,
        inquiryRepository: InquiryRepository,
        inquiryMessageRepository: InquiryMessageRepository,
        saveEmailAttachmentsUseCase: SaveEmailAttachmentsUseCase,
      ) => {
        const findInquiryForInboundEmailUseCase = new FindInquiryForInboundEmailUseCase(
          inquiryRepository,
          inquiryMessageRepository,
          emailMessageRepository,
        );

        return new ReceiveInboundEmailUseCase(
          emailMessageRepository,
          createInquiryFromEmailUseCase,
          emailThreadRepository,
          findInquiryForInboundEmailUseCase,
          inquiryMessageRepository,
          saveEmailAttachmentsUseCase,
        );
      },
      inject: [
        EMAIL_MESSAGE_REPOSITORY,
        CreateInquiryFromEmailUseCase,
        EMAIL_THREAD_REPOSITORY,
        INQUIRY_REPOSITORY,
        INQUIRY_MESSAGE_REPOSITORY,
        SaveEmailAttachmentsUseCase,
      ],
    },
    {
      provide: AnalyzeEmailWithAiUseCase,
      useFactory: (
        emailAiAnalysisAdapter: EmailAiAnalysisAdapter,
        buildAiContextUseCase: BuildAiContextUseCase,
        aiInteractionDebugLogger: AiInteractionDebugLogger,
      ) => new AnalyzeEmailWithAiUseCase(
        emailAiAnalysisAdapter,
        buildAiContextUseCase,
        aiInteractionDebugLogger,
      ),
      inject: [EMAIL_AI_ANALYSIS_ADAPTER, BuildAiContextUseCase, FileAiInteractionDebugLogger],
    },
    {
      provide: PollEmailInboxUseCase,
      useFactory: (
        processedEmailTracker: ProcessedEmailTracker,
        receiveInboundEmailUseCase: ReceiveInboundEmailUseCase,
        analyzeEmailWithAiUseCase: AnalyzeEmailWithAiUseCase,
        inquiryMessageRepository: InquiryMessageRepository,
        emailMessageRepository: EmailMessageRepository,
        updateCustomerStatusFromAiAnalysisUseCase: UpdateCustomerStatusFromAiAnalysisUseCase,
        aiDecisionRepository: AiDecisionRepository,
        updateInquiryStructuredFactsFromAiUseCase: UpdateInquiryStructuredFactsFromAiUseCase,
        applyAiSuggestedStatusUseCase: ApplyAiSuggestedStatusUseCase,
        generateBusinessSubjectUseCase: GenerateBusinessSubjectUseCase,
      ) => new PollEmailInboxUseCase(
        processedEmailTracker,
        receiveInboundEmailUseCase,
        analyzeEmailWithAiUseCase,
        inquiryMessageRepository,
        emailMessageRepository,
        updateCustomerStatusFromAiAnalysisUseCase,
        aiDecisionRepository,
        updateInquiryStructuredFactsFromAiUseCase,
        applyAiSuggestedStatusUseCase,
        generateBusinessSubjectUseCase,
      ),
      inject: [
        PROCESSED_EMAIL_TRACKER,
        ReceiveInboundEmailUseCase,
        AnalyzeEmailWithAiUseCase,
        INQUIRY_MESSAGE_REPOSITORY,
        EMAIL_MESSAGE_REPOSITORY,
        UpdateCustomerStatusFromAiAnalysisUseCase,
        AI_DECISION_REPOSITORY,
        UpdateInquiryStructuredFactsFromAiUseCase,
        ApplyAiSuggestedStatusUseCase,
        GenerateBusinessSubjectUseCase,
      ],
    },
  ],
})
export class EmailModule {}
