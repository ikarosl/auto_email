import { EmailMessage } from '../../../email/domain/entities/email-message.entity.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { ContextPurpose } from '../../domain/enums/context-purpose.enum.js';
import { ContextBudget } from '../../domain/value-objects/context-budget.vo.js';

export interface BuildAiContextInput {
  inquiryCase: InquiryCase;
  currentEmailMessage: EmailMessage;
  purpose: ContextPurpose;
  systemPrompt: string;
  outputFormatInstruction: string;
  outputSchema?: Record<string, string>;
  humanInstructions?: string;
  recentEmailMessages?: EmailMessage[];
  recentOurReplies?: EmailMessage[];
  budget?: ContextBudget;
}
