import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';
import { CreateInquiryUseCase } from './application/use-cases/create-inquiry.use-case.js';
import { CreateInquiryFromEmailUseCase } from './application/use-cases/create-inquiry-from-email.use-case.js';
import { GetInquiryUseCase } from './application/use-cases/get-inquiry.use-case.js';
import { InquiryMessageRepository } from './application/ports/inquiry-message.repository.js';
import { ListAllowedTransitionsUseCase } from './application/use-cases/list-allowed-transitions.use-case.js';
import { ListInquiriesUseCase } from './application/use-cases/list-inquiries.use-case.js';
import { TransitionInquiryStatusUseCase } from './application/use-cases/transition-inquiry-status.use-case.js';
import { UpdateCustomerStatusFromAiAnalysisUseCase } from './application/use-cases/update-customer-status-from-ai-analysis.use-case.js';
import { CustomerRepository } from './application/ports/customer.repository.js';
import { InquiryStateMachine } from './domain/state-machine/inquiry-state-machine.js';
import { PrismaCustomerRepository } from './infrastructure/repositories/prisma-customer.repository.js';
import { PrismaInquiryMessageRepository } from './infrastructure/repositories/prisma-inquiry-message.repository.js';
import { PrismaInquiryRepository } from './infrastructure/repositories/prisma-inquiry.repository.js';
import { PrismaInquiryStatusLogRepository } from './infrastructure/repositories/prisma-inquiry-status-log.repository.js';
import { InquiryStatusLogRepository } from './application/ports/inquiry-status-log.repository.js';
import { InquiryController } from './presentation/inquiry.controller.js';
import { CUSTOMER_REPOSITORY, INQUIRY_MESSAGE_REPOSITORY, INQUIRY_REPOSITORY, INQUIRY_STATUS_LOG_REPOSITORY } from './inquiry.tokens.js';
import { InquiryRepository } from './application/ports/inquiry.repository.js';

@Module({
  controllers: [InquiryController],
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
  ],
  exports: [
    INQUIRY_REPOSITORY,
    INQUIRY_MESSAGE_REPOSITORY,
    CUSTOMER_REPOSITORY,
    INQUIRY_STATUS_LOG_REPOSITORY,
    InquiryStateMachine,
    CreateInquiryFromEmailUseCase,
    UpdateCustomerStatusFromAiAnalysisUseCase,
  ],
})
export class InquiryModule {}
