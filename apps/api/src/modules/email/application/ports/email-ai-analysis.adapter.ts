import { EmailMessage } from '../../domain/entities/email-message.entity.js';

export interface EmailAiAnalysisAdapter {
  analyze(emailMessage: EmailMessage): Promise<string>;
}
