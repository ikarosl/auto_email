import { BuildAiContextUseCase } from '../../../context/application/use-cases/build-ai-context.use-case.js';
import { ContextPurpose } from '../../../context/domain/enums/context-purpose.enum.js';
import { AiChatMessage } from '../../../context/domain/value-objects/ai-chat-message.vo.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailAiAnalysis } from '../../domain/value-objects/email-ai-analysis.vo.js';
import { emailAiAnalysisSchema } from '../dto/email-ai-analysis.schema.js';
import { EmailAiAnalysisAdapter } from '../ports/email-ai-analysis.adapter.js';
import { AiInteractionDebugLogger } from '../ports/ai-interaction-debug-logger.js';
import { EMAIL_ANALYSIS_SYSTEM_PROMPT } from '../prompts/email-analysis.prompt.js';

export interface AnalyzeEmailWithAiSuccess {
  success: true;
  analysis: EmailAiAnalysis;
  rawOutput: string;
  contextSnapshotId?: string;
  estimatedContextTokens?: number;
  contextMessages?: AiChatMessage[];
}

export interface AnalyzeEmailWithAiFailure {
  success: false;
  errorCode: 'ai_empty_output' | 'ai_json_parse_failed' | 'ai_validation_failed';
  message: string;
  rawOutput?: string;
  humanReviewRequired: true;
  contextSnapshotId?: string;
  estimatedContextTokens?: number;
  contextMessages?: AiChatMessage[];
}

export type AnalyzeEmailWithAiResult = AnalyzeEmailWithAiSuccess | AnalyzeEmailWithAiFailure;

export interface AnalyzeEmailWithAiOptions {
  inquiryCase?: InquiryCase;
  recentEmailMessages?: EmailMessage[];
  recentOurReplies?: EmailMessage[];
}

export class AnalyzeEmailWithAiUseCase {
  constructor(
    private readonly emailAiAnalysisAdapter: EmailAiAnalysisAdapter,
    private readonly buildAiContextUseCase?: BuildAiContextUseCase,
    private readonly aiInteractionDebugLogger?: AiInteractionDebugLogger,
  ) {}

  async execute(
    emailMessage: EmailMessage,
    options: AnalyzeEmailWithAiOptions = {},
  ): Promise<AnalyzeEmailWithAiResult> {
    const context = await this.buildMessages(emailMessage, options);
    const rawOutput = (await this.emailAiAnalysisAdapter.analyze(context.messages)).trim();

    if (!rawOutput) {
      await this.logAiInteraction(emailMessage, options, context, {
        errorCode: 'ai_empty_output',
        message: 'AI returned empty output.',
      });

      return {
        success: false,
        errorCode: 'ai_empty_output',
        message: 'AI returned empty output.',
        humanReviewRequired: true,
        contextSnapshotId: context.contextSnapshotId,
        estimatedContextTokens: context.estimatedTokens,
        contextMessages: context.messages,
      };
    }

    const jsonText = extractJsonText(rawOutput);
    if (!jsonText) {
      await this.logAiInteraction(emailMessage, options, context, {
        errorCode: 'ai_json_parse_failed',
        message: 'AI output did not contain a JSON object.',
      }, rawOutput);

      return {
        success: false,
        errorCode: 'ai_json_parse_failed',
        message: 'AI output did not contain a JSON object.',
        rawOutput,
        humanReviewRequired: true,
        contextSnapshotId: context.contextSnapshotId,
        estimatedContextTokens: context.estimatedTokens,
        contextMessages: context.messages,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logAiInteraction(emailMessage, options, context, {
        errorCode: 'ai_json_parse_failed',
        message,
      }, rawOutput);

      return {
        success: false,
        errorCode: 'ai_json_parse_failed',
        message,
        rawOutput,
        humanReviewRequired: true,
        contextSnapshotId: context.contextSnapshotId,
        estimatedContextTokens: context.estimatedTokens,
        contextMessages: context.messages,
      };
    }

    const validation = emailAiAnalysisSchema.safeParse(parsed);
    if (!validation.success) {
      const message = validation.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      await this.logAiInteraction(emailMessage, options, context, {
        errorCode: 'ai_validation_failed',
        message,
      }, rawOutput);

      return {
        success: false,
        errorCode: 'ai_validation_failed',
        message,
        rawOutput,
        humanReviewRequired: true,
        contextSnapshotId: context.contextSnapshotId,
        estimatedContextTokens: context.estimatedTokens,
        contextMessages: context.messages,
      };
    }

    await this.logAiInteraction(emailMessage, options, context, undefined, rawOutput, validation.data);

    return {
      success: true,
      analysis: validation.data,
      rawOutput,
      contextSnapshotId: context.contextSnapshotId,
      estimatedContextTokens: context.estimatedTokens,
      contextMessages: context.messages,
    };
  }

  private async buildMessages(
    emailMessage: EmailMessage,
    options: AnalyzeEmailWithAiOptions,
  ): Promise<{ messages: AiChatMessage[]; contextSnapshotId?: string; estimatedTokens?: number }> {
    if (this.buildAiContextUseCase && options.inquiryCase) {
      const result = await this.buildAiContextUseCase.execute({
        inquiryCase: options.inquiryCase,
        currentEmailMessage: emailMessage,
        purpose: ContextPurpose.EMAIL_ANALYSIS,
        systemPrompt: EMAIL_ANALYSIS_SYSTEM_PROMPT,
        outputFormatInstruction: 'Return only valid JSON. Do not include markdown fences or explanatory text.',
        recentEmailMessages: options.recentEmailMessages,
        recentOurReplies: options.recentOurReplies,
      });

      return {
        messages: result.messages,
        contextSnapshotId: result.contextSnapshotId,
        estimatedTokens: result.estimatedTokens,
      };
    }

    return {
      messages: [
        {
          role: 'system',
          content: EMAIL_ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: formatEmailForAnalysis(emailMessage),
        },
      ],
    };
  }

  private async logAiInteraction(
    emailMessage: EmailMessage,
    options: AnalyzeEmailWithAiOptions,
    context: { messages: AiChatMessage[]; contextSnapshotId?: string; estimatedTokens?: number },
    validationError?: { errorCode: string; message: string },
    rawOutput?: string,
    analysis?: EmailAiAnalysis,
  ): Promise<void> {
    if (!this.aiInteractionDebugLogger) {
      return;
    }

    try {
      await this.aiInteractionDebugLogger.log({
        occurredAt: new Date(),
        emailMessage,
        inquiryCase: options.inquiryCase,
        contextSnapshotId: context.contextSnapshotId,
        estimatedContextTokens: context.estimatedTokens,
        messages: context.messages,
        rawOutput,
        analysis,
        validationError,
      });
    } catch {
      // Debug logging must never block the email processing pipeline.
    }
  }
}

function formatEmailForAnalysis(emailMessage: EmailMessage): string {
  return [
    `From: ${emailMessage.fromName || ''} <${emailMessage.fromEmail}>`,
    `To: ${emailMessage.toEmails.join(', ')}`,
    `Subject: ${emailMessage.subject}`,
    `ReceivedAt: ${emailMessage.receivedAt.toISOString()}`,
    '',
    'Plain text body:',
    emailMessage.bodyText || '(empty)',
    '',
    'HTML body:',
    emailMessage.bodyHtml || '(empty)',
    '',
    'Return only valid JSON. Do not include markdown fences or explanatory text.',
  ].join('\n');
}

function extractJsonText(rawOutput: string): string | undefined {
  const trimmed = rawOutput
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }

  return trimmed.slice(start, end + 1);
}
