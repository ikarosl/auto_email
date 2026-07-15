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
import { InquiryStateMachine } from '../inquiry/domain/state-machine/inquiry-state-machine.js';
import { ReceiveInboundEmailUseCase } from './application/use-cases/receive-inbound-email.use-case.js';
import { SaveEmailAttachmentsUseCase } from './application/use-cases/save-email-attachments.use-case.js';
import { AnalyzeEmailWithAiUseCase } from './application/use-cases/analyze-email-with-ai.use-case.js';
import { PollEmailInboxUseCase } from './application/use-cases/poll-email-inbox.use-case.js';
import { GenerateReplyDraftUseCase } from './application/use-cases/generate-reply-draft.use-case.js';
import { ManageReplyDraftUseCase } from './application/use-cases/manage-reply-draft.use-case.js';
import { SendApprovedReplyUseCase } from './application/use-cases/send-approved-reply.use-case.js';
import { AnalyzeOutboundEmailEventUseCase } from './application/use-cases/analyze-outbound-email-event.use-case.js';
import { ApplyOutboundEmailEventUseCase } from './application/use-cases/apply-outbound-email-event.use-case.js';
import { ProcessInquiryEmailEventUseCase } from './application/use-cases/process-inquiry-email-event.use-case.js';
import { ReviewEmailWorkflowDecisionUseCase } from './application/use-cases/review-email-workflow-decision.use-case.js';
import { EmailMessageRepository } from './application/ports/email-message.repository.js';
import { EmailAttachmentRepository } from './application/ports/email-attachment.repository.js';
import { AttachmentStorageAdapter } from './application/ports/attachment-storage.adapter.js';
import { AttachmentParserAdapter } from './application/ports/attachment-parser.adapter.js';
import { AttachmentAiReaderAdapter } from './application/ports/attachment-ai-reader.adapter.js';
import { EmailAiAnalysisAdapter } from './application/ports/email-ai-analysis.adapter.js';
import { EmailSenderAdapter } from './application/ports/email-sender.adapter.js';
import { ReplyDraftAiAdapter } from './application/ports/reply-draft-ai.adapter.js';
import { AiDecisionRepository } from './application/ports/ai-decision.repository.js';
import { EmailThreadRepository } from './application/ports/email-thread.repository.js';
import { ProcessedEmailTracker } from './application/ports/processed-email-tracker.js';
import { AiInteractionDebugLogger } from './application/ports/ai-interaction-debug-logger.js';
import { DeepseekEmailAnalysisAdapter } from './infrastructure/adapters/deepseek-email-analysis.adapter.js';
import { DeepseekReplyDraftAdapter } from './infrastructure/adapters/deepseek-reply-draft.adapter.js';
import { SimulatedEmailSenderAdapter } from './infrastructure/adapters/simulated-email-sender.adapter.js';
import { SmtpEmailSenderAdapter } from './infrastructure/adapters/smtp-email-sender.adapter.js';
import { MailRuntimeConfigService } from './infrastructure/config/mail-runtime-config.service.js';
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
import { InquiryReplyDraftController } from './presentation/inquiry-reply-draft.controller.js';
import { MailRuntimeController } from './presentation/mail-runtime.controller.js';
import { InquiryEmailMessageController } from './presentation/inquiry-email-message.controller.js';
import { EmailWorkflowDecisionController } from './presentation/email-workflow-decision.controller.js';
import {
  AI_DECISION_REPOSITORY,
  ATTACHMENT_AI_READER_ADAPTER,
  ATTACHMENT_PARSER_ADAPTER,
  ATTACHMENT_STORAGE_ADAPTER,
  EMAIL_SENDER_ADAPTER,
  EMAIL_ATTACHMENT_REPOSITORY,
  EMAIL_AI_ANALYSIS_ADAPTER,
  EMAIL_MESSAGE_REPOSITORY,
  EMAIL_THREAD_REPOSITORY,
  PROCESSED_EMAIL_TRACKER,
  REPLY_DRAFT_AI_ADAPTER,
} from './email.tokens.js';

@Module({
  imports: [InquiryModule, ContextModule],
  controllers: [
    EmailWebhookController,
    EmailThreadController,
    AiDecisionController,
    ReplyDraftController,
    InquiryReplyDraftController,
    MailRuntimeController,
    MessageController,
    InquiryEmailMessageController,
    EmailWorkflowDecisionController,
  ],
  providers: [
    MailRuntimeConfigService,
    {
      provide: REPLY_DRAFT_AI_ADAPTER,
      useClass: DeepseekReplyDraftAdapter,
    },
    {
      provide: EMAIL_SENDER_ADAPTER,
      useFactory: (config: MailRuntimeConfigService) => config.operationMode === 'production'
        ? new SmtpEmailSenderAdapter(config.smtp!)
        : new SimulatedEmailSenderAdapter(),
      inject: [MailRuntimeConfigService],
    },
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
      provide: AnalyzeOutboundEmailEventUseCase,
      useFactory: (
        emailAiAnalysisAdapter: EmailAiAnalysisAdapter,
        buildAiContextUseCase: BuildAiContextUseCase,
      ) => new AnalyzeOutboundEmailEventUseCase(emailAiAnalysisAdapter, buildAiContextUseCase),
      inject: [EMAIL_AI_ANALYSIS_ADAPTER, BuildAiContextUseCase],
    },
    {
      provide: ApplyOutboundEmailEventUseCase,
      useFactory: (prisma: PrismaService, stateMachine: InquiryStateMachine) =>
        new ApplyOutboundEmailEventUseCase(prisma, stateMachine),
      inject: [PrismaService, InquiryStateMachine],
    },
    {
      provide: ReviewEmailWorkflowDecisionUseCase,
      useFactory: (prisma: PrismaService, stateMachine: InquiryStateMachine) =>
        new ReviewEmailWorkflowDecisionUseCase(prisma, stateMachine),
      inject: [PrismaService, InquiryStateMachine],
    },
    {
      provide: GenerateReplyDraftUseCase,
      useFactory: (
        prisma: PrismaService,
        inquiryRepository: InquiryRepository,
        inquiryMessageRepository: InquiryMessageRepository,
        emailMessageRepository: EmailMessageRepository,
        buildAiContextUseCase: BuildAiContextUseCase,
        aiAdapter: ReplyDraftAiAdapter,
      ) => new GenerateReplyDraftUseCase(
        prisma,
        inquiryRepository,
        inquiryMessageRepository,
        emailMessageRepository,
        buildAiContextUseCase,
        aiAdapter,
      ),
      inject: [
        PrismaService,
        INQUIRY_REPOSITORY,
        INQUIRY_MESSAGE_REPOSITORY,
        EMAIL_MESSAGE_REPOSITORY,
        BuildAiContextUseCase,
        REPLY_DRAFT_AI_ADAPTER,
      ],
    },
    {
      provide: ManageReplyDraftUseCase,
      useFactory: (prisma: PrismaService) => new ManageReplyDraftUseCase(prisma),
      inject: [PrismaService],
    },
    {
      provide: SendApprovedReplyUseCase,
      useFactory: (
        prisma: PrismaService,
        config: MailRuntimeConfigService,
        sender: EmailSenderAdapter,
      ) => new SendApprovedReplyUseCase(prisma, config, sender),
      inject: [PrismaService, MailRuntimeConfigService, EMAIL_SENDER_ADAPTER],
    },
    {
      provide: ProcessInquiryEmailEventUseCase,
      useFactory: (
        prisma: PrismaService,
        analyzeEmailWithAiUseCase: AnalyzeEmailWithAiUseCase,
        analyzeOutboundEmailEventUseCase: AnalyzeOutboundEmailEventUseCase,
        applyOutboundEmailEventUseCase: ApplyOutboundEmailEventUseCase,
        inquiryMessageRepository: InquiryMessageRepository,
        emailMessageRepository: EmailMessageRepository,
        updateCustomerStatusFromAiAnalysisUseCase: UpdateCustomerStatusFromAiAnalysisUseCase,
        aiDecisionRepository: AiDecisionRepository,
        updateInquiryStructuredFactsFromAiUseCase: UpdateInquiryStructuredFactsFromAiUseCase,
        applyAiSuggestedStatusUseCase: ApplyAiSuggestedStatusUseCase,
        generateBusinessSubjectUseCase: GenerateBusinessSubjectUseCase,
        generateReplyDraftUseCase: GenerateReplyDraftUseCase,
      ) => new ProcessInquiryEmailEventUseCase(
        prisma,
        analyzeEmailWithAiUseCase,
        analyzeOutboundEmailEventUseCase,
        applyOutboundEmailEventUseCase,
        inquiryMessageRepository,
        emailMessageRepository,
        updateCustomerStatusFromAiAnalysisUseCase,
        aiDecisionRepository,
        updateInquiryStructuredFactsFromAiUseCase,
        applyAiSuggestedStatusUseCase,
        generateBusinessSubjectUseCase,
        generateReplyDraftUseCase,
      ),
      inject: [
        PrismaService,
        AnalyzeEmailWithAiUseCase,
        AnalyzeOutboundEmailEventUseCase,
        ApplyOutboundEmailEventUseCase,
        INQUIRY_MESSAGE_REPOSITORY,
        EMAIL_MESSAGE_REPOSITORY,
        UpdateCustomerStatusFromAiAnalysisUseCase,
        AI_DECISION_REPOSITORY,
        UpdateInquiryStructuredFactsFromAiUseCase,
        ApplyAiSuggestedStatusUseCase,
        GenerateBusinessSubjectUseCase,
        GenerateReplyDraftUseCase,
      ],
    },
    {
      provide: PollEmailInboxUseCase,
      useFactory: (
        processedEmailTracker: ProcessedEmailTracker,
        receiveInboundEmailUseCase: ReceiveInboundEmailUseCase,
        processInquiryEmailEventUseCase: ProcessInquiryEmailEventUseCase,
      ) => new PollEmailInboxUseCase(
        processedEmailTracker,
        receiveInboundEmailUseCase,
        processInquiryEmailEventUseCase,
      ),
      inject: [
        PROCESSED_EMAIL_TRACKER,
        ReceiveInboundEmailUseCase,
        ProcessInquiryEmailEventUseCase,
      ],
    },
  ],
})
export class EmailModule {}
