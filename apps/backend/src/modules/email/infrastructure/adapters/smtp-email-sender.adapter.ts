import nodemailer from 'nodemailer';

import type {
  EmailSenderAdapter,
  SendEmailInput,
  SendEmailResult,
} from '../../application/ports/email-sender.adapter.js';
import type { SmtpRuntimeConfig } from '../config/mail-runtime-config.service.js';

export class SmtpEmailSenderAdapter implements EmailSenderAdapter {
  private readonly transporter;

  constructor(private readonly config: SmtpRuntimeConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const result = await this.transporter.sendMail({
      from: { address: input.fromEmail, name: input.fromName },
      to: input.recipient,
      subject: input.subject,
      text: input.bodyText,
      messageId: input.messageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
      attachments: input.attachments.map((attachment) => ({
        filename: attachment.fileName,
        path: attachment.path,
        contentType: attachment.mimeType,
      })),
    });

    const accepted = result.accepted.map(String);
    return {
      operationMode: 'production',
      provider: 'smtp',
      status: accepted.length > 0 ? 'accepted' : 'rejected',
      messageId: result.messageId || input.messageId,
      providerResponse: {
        accepted,
        rejected: result.rejected.map(String),
        response: result.response,
      },
    };
  }
}
