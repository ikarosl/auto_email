import { mkdir, appendFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  AiInteractionDebugLogEntry,
  AiInteractionDebugLogger,
} from '../../application/ports/ai-interaction-debug-logger.js';

export class FileAiInteractionDebugLogger implements AiInteractionDebugLogger {
  async log(entry: AiInteractionDebugLogEntry): Promise<void> {
    if (!isEnabled()) {
      return;
    }

    const logPath = resolve(process.cwd(), process.env.AI_DEBUG_LOG_PATH || 'logs/ai-interactions-dev.jsonl');
    const payload = {
      occurredAt: entry.occurredAt.toISOString(),
      emailMessageId: entry.emailMessage.id,
      inquiryCaseId: entry.inquiryCase?.id,
      currentInquiryStatus: entry.inquiryCase?.status,
      contextSnapshotId: entry.contextSnapshotId,
      estimatedContextTokens: entry.estimatedContextTokens,
      messages: entry.messages,
      rawOutput: entry.rawOutput,
      analysis: entry.analysis,
      validationError: entry.validationError,
    };

    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify(payload)}\n`, 'utf8');
  }
}

function isEnabled(): boolean {
  const value = process.env.AI_DEBUG_LOG_ENABLED;
  if (value === undefined || value === '') {
    return process.env.NODE_ENV === 'development';
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
