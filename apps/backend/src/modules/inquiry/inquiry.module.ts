import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';
import { CreateInquiryUseCase } from './application/use-cases/create-inquiry.use-case.js';
import { CreateInquiryFromEmailUseCase } from './application/use-cases/create-inquiry-from-email.use-case.js';
import { GetInquiryUseCase } from './application/use-cases/get-inquiry.use-case.js';
import { InquiryMessageRepository } from './application/ports/inquiry-message.repository.js';
import { ListInquiriesUseCase } from './application/use-cases/list-inquiries.use-case.js';
import { ApplyInquiryStateDecisionUseCase } from './application/use-cases/apply-inquiry-state-decision.use-case.js';
import { UpdateInquiryStructuredFactsFromAiUseCase } from './application/use-cases/update-inquiry-structured-facts-from-ai.use-case.js';
import { UpdateCustomerStatusFromAiAnalysisUseCase } from './application/use-cases/update-customer-status-from-ai-analysis.use-case.js';
import { CustomerRepository } from './application/ports/customer.repository.js';
import { PrismaCustomerRepository } from './infrastructure/repositories/prisma-customer.repository.js';
import { PrismaInquiryMessageRepository } from './infrastructure/repositories/prisma-inquiry-message.repository.js';
import { PrismaInquiryRepository } from './infrastructure/repositories/prisma-inquiry.repository.js';
import { GenerateBusinessSubjectUseCase } from './application/use-cases/generate-business-subject.use-case.js';
import { BusinessSubjectGeneratorAdapter } from './application/ports/business-subject-generator.adapter.js';
import { DeepseekBusinessSubjectGenerator } from './infrastructure/adapters/deepseek-business-subject-generator.adapter.js';
import { CustomerController } from './presentation/customer.controller.js';
import { InquiryController, InquiryStateDecisionController } from './presentation/inquiry.controller.js';
import { InquiryMessageController } from './presentation/inquiry-message.controller.js';
import { OrganizationController } from './presentation/organization.controller.js';
import {
  BUSINESS_SUBJECT_GENERATOR,
  CUSTOMER_REPOSITORY,
  INQUIRY_MESSAGE_REPOSITORY,
  INQUIRY_REPOSITORY,
} from './inquiry.tokens.js';
import { InquiryRepository } from './application/ports/inquiry.repository.js';

@Module({
  controllers: [
    InquiryController,
    InquiryStateDecisionController,
    InquiryMessageController,
    CustomerController,
    OrganizationController,
  ],
  providers: [
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
      provide: UpdateCustomerStatusFromAiAnalysisUseCase,
      useFactory: (customerRepository: CustomerRepository) =>
        new UpdateCustomerStatusFromAiAnalysisUseCase(customerRepository),
      inject: [CUSTOMER_REPOSITORY],
    },
    {
      provide: ApplyInquiryStateDecisionUseCase,
      useFactory: (prisma: PrismaService) => new ApplyInquiryStateDecisionUseCase(prisma),
      inject: [PrismaService],
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
    CreateInquiryFromEmailUseCase,
    UpdateCustomerStatusFromAiAnalysisUseCase,
    ApplyInquiryStateDecisionUseCase,
    UpdateInquiryStructuredFactsFromAiUseCase,
    GenerateBusinessSubjectUseCase,
  ],
})
export class InquiryModule {}
