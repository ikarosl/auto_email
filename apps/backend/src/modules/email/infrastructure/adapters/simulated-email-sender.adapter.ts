import type {
  EmailSenderAdapter,
  SendEmailInput,
  SendEmailResult,
} from '../../application/ports/email-sender.adapter.js';

export class SimulatedEmailSenderAdapter implements EmailSenderAdapter {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    return {
      operationMode: 'debug',
      provider: 'simulated',
      status: 'simulated',
      messageId: input.messageId,
      providerResponse: {
        simulated: true,
        attachmentCount: input.attachments.length,
      },
    };
  }
}
