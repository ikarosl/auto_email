import type { MailOperationMode } from '../../infrastructure/config/mail-runtime-config.service.js';

export interface OutboundEmailAttachment {
  fileName: string;
  path: string;
  mimeType: string;
}

export interface SendEmailInput {
  fromEmail: string;
  fromName: string;
  recipient: string;
  subject: string;
  bodyText: string;
  messageId: string;
  inReplyTo?: string;
  references: string[];
  attachments: OutboundEmailAttachment[];
}

export interface SendEmailResult {
  operationMode: MailOperationMode;
  provider: 'simulated' | 'smtp';
  status: 'simulated' | 'accepted' | 'rejected';
  messageId: string;
  providerResponse: Record<string, unknown>;
}

export interface EmailSenderAdapter {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
