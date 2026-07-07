import { Body, Controller, Post } from '@nestjs/common';

import { InboundEmailWebhookDto } from '../application/dto/inbound-email-webhook.dto.js';
import { ReceiveInboundEmailUseCase } from '../application/use-cases/receive-inbound-email.use-case.js';
import { EmailSource } from '../domain/enums/email-source.enum.js';

@Controller('webhooks/email')
export class EmailWebhookController {
  constructor(private readonly receiveInboundEmailUseCase: ReceiveInboundEmailUseCase) {}

  @Post('inbound')
  async receiveInbound(@Body() body: InboundEmailWebhookDto) {
    const result = await this.receiveInboundEmailUseCase.execute({
      messageId: body.messageId,
      mailboxAccountId: '',
      threadId: body.threadId,
      fromEmail: body.fromEmail,
      fromName: body.fromName,
      toEmails: body.toEmails ?? [],
      ccEmails: body.ccEmails ?? [],
      subject: body.subject,
      bodyText: body.bodyText,
      bodyHtml: body.bodyHtml,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
      source: body.source ?? EmailSource.WEBHOOK,
    });

    return {
      success: true,
      emailMessageId: result.emailMessage.id,
      inquiryCaseId: result.inquiryCase?.id,
      inquiryStatus: result.inquiryCase?.status,
      skippedReason: result.skippedReason,
    };
  }
}
