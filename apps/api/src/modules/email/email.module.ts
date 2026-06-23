import { Module } from '@nestjs/common';

import { CreateInquiryFromEmailUseCase } from '../inquiry/application/use-cases/create-inquiry-from-email.use-case.js';
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
      ) => new ReceiveInboundEmailUseCase(emailMessageRepository, createInquiryFromEmailUseCase),
      inject: [EMAIL_MESSAGE_REPOSITORY, CreateInquiryFromEmailUseCase],
    },
  ],
})
export class EmailModule {}
