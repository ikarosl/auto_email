import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';
import { CreateInquiryUseCase } from './application/use-cases/create-inquiry.use-case.js';
import { CreateInquiryFromEmailUseCase } from './application/use-cases/create-inquiry-from-email.use-case.js';
import { GetInquiryUseCase } from './application/use-cases/get-inquiry.use-case.js';
import { InquiryMessageRepository } from './application/ports/inquiry-message.repository.js';
import { ListAllowedTransitionsUseCase } from './application/use-cases/list-allowed-transitions.use-case.js';
import { ListInquiriesUseCase } from './application/use-cases/list-inquiries.use-case.js';
import { TransitionInquiryStatusUseCase } from './application/use-cases/transition-inquiry-status.use-case.js';
import { ApplyAiSuggestedStatusUseCase } from './application/use-cases/apply-ai-suggested-status.use-case.js';
import { UpdateInquiryStructuredFactsFromAiUseCase } from './application/use-cases/update-inquiry-structured-facts-from-ai.use-case.js';
import { UpdateCustomerStatusFromAiAnalysisUseCase } from './application/use-cases/update-customer-status-from-ai-analysis.use-case.js';
import { CustomerRepository } from './application/ports/customer.repository.js';
import { InquiryStateMachine } from './domain/state-machine/inquiry-state-machine.js';
import { PrismaCustomerRepository } from './infrastructure/repositories/prisma-customer.repository.js';
import { PrismaInquiryMessageRepository } from './infrastructure/repositories/prisma-inquiry-message.repository.js';
import { PrismaInquiryRepository } from './infrastructure/repositories/prisma-inquiry.repository.js';
import { PrismaInquiryStatusLogRepository } from './infrastructure/repositories/prisma-inquiry-status-log.repository.js';
import { InquiryStatusLogRepository } from './application/ports/inquiry-status-log.repository.js';
import { GenerateBusinessSubjectUseCase } from './application/use-cases/generate-business-subject.use-case.js';
import { BusinessSubjectGeneratorAdapter } from './application/ports/business-subject-generator.adapter.js';
import { DeepseekBusinessSubjectGenerator } from './infrastructure/adapters/deepseek-business-subject-generator.adapter.js';
import { CustomerController } from './presentation/customer.controller.js';
import { InquiryController } from './presentation/inquiry.controller.js';
import { InquiryMessageController } from './presentation/inquiry-message.controller.js';
import { OrganizationController } from './presentation/organization.controller.js';
import {
  BUSINESS_SUBJECT_GENERATOR,
  CUSTOMER_REPOSITORY,
  INQUIRY_MESSAGE_REPOSITORY,
  INQUIRY_REPOSITORY,
  INQUIRY_STATUS_LOG_REPOSITORY,
} from './inquiry.tokens.js';
import { InquiryRepository } from './application/ports/inquiry.repository.js';

@Module({
  controllers: [InquiryController, InquiryMessageController, CustomerController, OrganizationController],
  providers: [
    InquiryStateMachine,
    {
      provide: CUSTOMER_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaCustomerRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: INQUIRY_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInquiryRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: INQUIRY_MESSAGE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInquiryMessageRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: INQUIRY_STATUS_LOG_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInquiryStatusLogRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CreateInquiryUseCase,
      useFactory: (inquiryRepository: InquiryRepository) => new CreateInquiryUseCase(inquiryRepository),
      inject: [INQUIRY_REPOSITORY],
    },
    {
      provide: CreateInquiryFromEmailUseCase,
      useFactory: (inquiryRepository: InquiryRepository) => new CreateInquiryFromEmailUseCase(inquiryRepository),
      inject: [INQUIRY_REPOSITORY],
    },
    {
      provide: GetInquiryUseCase,
      useFactory: (inquiryRepository: InquiryRepository) => new GetInquiryUseCase(inquiryRepository),
      inject: [INQUIRY_REPOSITORY],
    },
    {
      provide: ListInquiriesUseCase,
      useFactory: (inquiryRepository: InquiryRepository) => new ListInquiriesUseCase(inquiryRepository),
      inject: [INQUIRY_REPOSITORY],
    },
    {
      provide: ListAllowedTransitionsUseCase,
      useFactory: (getInquiryUseCase: GetInquiryUseCase) => new ListAllowedTransitionsUseCase(getInquiryUseCase),
      inject: [GetInquiryUseCase],
    },
    {
      provide: UpdateCustomerStatusFromAiAnalysisUseCase,
      useFactory: (customerRepository: CustomerRepository) =>
        new UpdateCustomerStatusFromAiAnalysisUseCase(customerRepository),
      inject: [CUSTOMER_REPOSITORY],
    },
    {
      provide: TransitionInquiryStatusUseCase,
      useFactory: (
        inquiryRepository: InquiryRepository,
        getInquiryUseCase: GetInquiryUseCase,
        inquiryStateMachine: InquiryStateMachine,
        inquiryStatusLogRepository: InquiryStatusLogRepository,
      ) => new TransitionInquiryStatusUseCase(
        inquiryRepository,
        getInquiryUseCase,
        inquiryStateMachine,
        inquiryStatusLogRepository,
      ),
      inject: [INQUIRY_REPOSITORY, GetInquiryUseCase, InquiryStateMachine, INQUIRY_STATUS_LOG_REPOSITORY],
    },
    {
      provide: ApplyAiSuggestedStatusUseCase,
      useFactory: (prisma: PrismaService, inquiryStateMachine: InquiryStateMachine) =>
        new ApplyAiSuggestedStatusUseCase(prisma, inquiryStateMachine),
      inject: [PrismaService, InquiryStateMachine],
    },
    {
      provide: UpdateInquiryStructuredFactsFromAiUseCase,
      useFactory: (prisma: PrismaService) => new UpdateInquiryStructuredFactsFromAiUseCase(prisma),
      inject: [PrismaService],
    },
    {
      provide: BUSINESS_SUBJECT_GENERATOR,
      useClass: DeepseekBusinessSubjectGenerator,
    },
    {
      provide: GenerateBusinessSubjectUseCase,
      useFactory: (
        inquiryRepository: InquiryRepository,
        generator: BusinessSubjectGeneratorAdapter,
      ) => new GenerateBusinessSubjectUseCase(inquiryRepository, generator),
      inject: [INQUIRY_REPOSITORY, BUSINESS_SUBJECT_GENERATOR],
    },
  ],
  exports: [
    INQUIRY_REPOSITORY,
    INQUIRY_MESSAGE_REPOSITORY,
    CUSTOMER_REPOSITORY,
    INQUIRY_STATUS_LOG_REPOSITORY,
    InquiryStateMachine,
    CreateInquiryFromEmailUseCase,
    UpdateCustomerStatusFromAiAnalysisUseCase,
    ApplyAiSuggestedStatusUseCase,
    UpdateInquiryStructuredFactsFromAiUseCase,
    GenerateBusinessSubjectUseCase,
  ],
})
export class InquiryModule {}
