import { BuildAiContextUseCase } from '../../../context/application/use-cases/build-ai-context.use-case.js';
import { ContextPurpose } from '../../../context/domain/enums/context-purpose.enum.js';
import { AiChatMessage } from '../../../context/domain/value-objects/ai-chat-message.vo.js';
import { InquiryCase } from '../../../inquiry/domain/entities/inquiry-case.entity.js';
import { EmailMessage } from '../../domain/entities/email-message.entity.js';
import { EmailAiAnalysis } from '../../domain/value-objects/email-ai-analysis.vo.js';
import { emailAiAnalysisSchema } from '../dto/email-ai-analysis.schema.js';
import { EmailAiAnalysisAdapter } from '../ports/email-ai-analysis.adapter.js';
import {
  AiInteractionDebugAttempt,
  AiInteractionDebugLogger,
} from '../ports/ai-interaction-debug-logger.js';
import { EMAIL_ANALYSIS_SYSTEM_PROMPT } from '../prompts/email-analysis.prompt.js';

const MAX_AI_ANALYSIS_ATTEMPTS = 3;

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
    const attempts: AiInteractionDebugAttempt[] = [];
    let lastFailure: AnalyzeEmailWithAiFailure | undefined;

    for (let attempt = 1; attempt <= MAX_AI_ANALYSIS_ATTEMPTS; attempt += 1) {
      const messages = buildAttemptMessages(context.messages, attempt, lastFailure);
      const rawOutput = (await this.emailAiAnalysisAdapter.analyze(messages)).trim();

      if (!rawOutput) {
        lastFailure = this.buildFailure(
          context,
          'ai_empty_output',
          'AI returned empty output.',
        );
        attempts.push({
          attempt,
          messages,
          validationError: {
            errorCode: lastFailure.errorCode,
            message: lastFailure.message,
          },
        });
        continue;
      }

      const jsonText = extractJsonText(rawOutput);
      if (!jsonText) {
        lastFailure = this.buildFailure(
          context,
          'ai_json_parse_failed',
          'AI output did not contain a JSON object.',
          rawOutput,
        );
        attempts.push({
          attempt,
          messages,
          rawOutput,
          validationError: {
            errorCode: lastFailure.errorCode,
            message: lastFailure.message,
          },
        });
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastFailure = this.buildFailure(context, 'ai_json_parse_failed', message, rawOutput);
        attempts.push({
          attempt,
          messages,
          rawOutput,
          validationError: {
            errorCode: lastFailure.errorCode,
            message: lastFailure.message,
          },
        });
        continue;
      }

      const validation = emailAiAnalysisSchema.safeParse(parsed);
      if (!validation.success) {
        const message = validation.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
        lastFailure = this.buildFailure(context, 'ai_validation_failed', message, rawOutput);
        attempts.push({
          attempt,
          messages,
          rawOutput,
          validationError: {
            errorCode: lastFailure.errorCode,
            message: lastFailure.message,
          },
        });
        continue;
      }

      attempts.push({ attempt, messages, rawOutput });
      await this.logAiInteraction(
        emailMessage,
        options,
        context,
        undefined,
        rawOutput,
        validation.data,
        attempts,
        attempt,
      );

      return {
        success: true,
        analysis: validation.data,
        rawOutput,
        contextSnapshotId: context.contextSnapshotId,
        estimatedContextTokens: context.estimatedTokens,
        contextMessages: context.messages,
      };
    }

    const finalFailure = lastFailure ?? this.buildFailure(
      context,
      'ai_empty_output',
      'AI returned no usable output.',
    );
    await this.logAiInteraction(
      emailMessage,
      options,
      context,
      {
        errorCode: finalFailure.errorCode,
        message: finalFailure.message,
      },
      finalFailure.rawOutput,
      undefined,
      attempts,
    );

    return finalFailure;
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
    attempts?: AiInteractionDebugAttempt[],
    successfulAttempt?: number,
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
        attempts,
        successfulAttempt,
      });
    } catch {
      // Debug logging must never block the email processing pipeline.
    }
  }

  private buildFailure(
    context: { messages: AiChatMessage[]; contextSnapshotId?: string; estimatedTokens?: number },
    errorCode: AnalyzeEmailWithAiFailure['errorCode'],
    message: string,
    rawOutput?: string,
  ): AnalyzeEmailWithAiFailure {
    return {
      success: false,
      errorCode,
      message,
      rawOutput,
      humanReviewRequired: true,
      contextSnapshotId: context.contextSnapshotId,
      estimatedContextTokens: context.estimatedTokens,
      contextMessages: context.messages,
    };
  }
}

function buildAttemptMessages(
  baseMessages: AiChatMessage[],
  attempt: number,
  previousFailure?: AnalyzeEmailWithAiFailure,
): AiChatMessage[] {
  if (attempt === 1 || !previousFailure) {
    return baseMessages;
  }

  return [
    ...baseMessages,
    {
      role: 'user',
      content: [
        `Context section: retry_repair_instruction`,
        `Previous attempt failed with ${previousFailure.errorCode}: ${previousFailure.message}`,
        'Return only one valid JSON object matching the required schema.',
        'Do not include markdown fences, comments, or explanatory text.',
        'For extractedRequirements values, use strings. Example: quantity should be "50 pcs" or "50", not a bare number.',
      ].join('\n'),
    },
  ];
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
