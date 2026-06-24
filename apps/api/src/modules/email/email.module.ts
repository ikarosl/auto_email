import { Module } from '@nestjs/common';

import { FindInquiryForInboundEmailUseCase } from '../inquiry/application/use-cases/find-inquiry-for-inbound-email.use-case.js';
import { CreateInquiryFromEmailUseCase } from '../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
import { InquiryMessageRepository } from '../inquiry/application/ports/inquiry-message.repository.js';
import { InquiryRepository } from '../inquiry/application/ports/inquiry.repository.js';
import { INQUIRY_MESSAGE_REPOSITORY, INQUIRY_REPOSITORY } from '../inquiry/inquiry.tokens.js';
import { InquiryModule } from '../inquiry/inquiry.module.js';
import { ReceiveInboundEmailUseCase } from './application/use-cases/receive-inbound-email.use-case.js';
import { EmailMessageRepository } from './application/ports/email-message.repository.js';
import { InMemoryEmailMessageRepository } from './infrastructure/repositories/in-memory-email-message.repository.js';
import { EmailWebhookController } from './presentation/email-webhook.controller.js';
import { EMAIL_MESSAGE_REPOSITORY } from './email.tokens.js';

@Module({
  imports: [InquiryModule],
  controllers: [EmailWebhookController],
  providers: [
    {
      provide: EMAIL_MESSAGE_REPOSITORY,
      useClass: InMemoryEmailMessageRepository,
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
  ],
})
export class EmailModule {}
