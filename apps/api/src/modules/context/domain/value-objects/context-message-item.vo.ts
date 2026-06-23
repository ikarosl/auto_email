import { EmailDirection } from '../../../email/domain/enums/email-direction.enum.js';

export interface ContextMessageItem {
  emailMessageId: string;
  direction: EmailDirection;
  subject: string;
  fromEmail: string;
  receivedAt: Date;
  bodyText?: string;
}
