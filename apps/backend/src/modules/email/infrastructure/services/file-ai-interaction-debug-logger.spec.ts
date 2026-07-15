import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { INITIAL_INQUIRY_STATE } from '../../../inquiry/domain/enums/inquiry-state.enum.js';
import { EmailDirection } from '../../domain/enums/email-direction.enum.js';
import { EmailSource } from '../../domain/enums/email-source.enum.js';
import { FileAiInteractionDebugLogger } from './file-ai-interaction-debug-logger.js';

describe('FileAiInteractionDebugLogger', () => {
  it('writes readable context payload without duplicating messages inside attempts', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ai-debug-log-'));
    const logPath = join(tempDir, 'ai-interactions.jsonl');
    const previousEnabled = process.env.AI_DEBUG_LOG_ENABLED;
    const previousPath = process.env.AI_DEBUG_LOG_PATH;
    process.env.AI_DEBUG_LOG_ENABLED = 'true';
    process.env.AI_DEBUG_LOG_PATH = logPath;

    try {
      const logger = new FileAiInteractionDebugLogger();
      const contextPayload = {
        inquiryState: {
          ...INITIAL_INQUIRY_STATE,
          customerEmail: 'buyer@example.com',
          subject: 'RF inquiry',
          latestMessageAt: '2026-06-23T00:00:00.000Z',
        },
        recentThreadMessages: [],
        ragReferences: [],
        currentEmail: {
          direction: EmailDirection.INBOUND,
          from: 'buyer@example.com',
          to: 'sales@example.com',
          subject: 'RF inquiry',
          receivedAt: '2026-06-23T00:00:00.000Z',
          cleanBody: 'Need 10 pcs.',
        },
        outputInstruction: {
          format: 'json_only' as const,
          schema: {
            isInquiry: 'boolean',
          },
        },
      };

      await logger.log({
        occurredAt: new Date('2026-06-23T00:00:00.000Z'),
        emailMessage: {
          id: 'email_001',
          externalMessageId: 'message_001',
          direction: EmailDirection.INBOUND,
          source: EmailSource.MOCK,
          fromEmail: 'buyer@example.com',
          toEmails: ['sales@example.com'],
          ccEmails: [],
          subject: 'RF inquiry',
          bodyText: 'Need 10 pcs.',
          receivedAt: new Date('2026-06-23T00:00:00.000Z'),
          createdAt: new Date('2026-06-23T00:00:00.000Z'),
        },
        contextPayload,
        messages: [
          { role: 'system', content: 'system rules' },
          { role: 'user', content: JSON.stringify(contextPayload, null, 2) },
        ],
        attempts: [
          {
            attempt: 1,
            rawOutput: '{"isInquiry":true}',
            messageCount: 2,
            usedRepairInstruction: false,
          },
        ],
        successfulAttempt: 1,
      });

      const line = (await readFile(logPath, 'utf8')).trim();
      const payload = JSON.parse(line) as Record<string, unknown>;
      const attempts = payload.attempts as Array<Record<string, unknown>>;

      assert.deepEqual(payload.contextPayload, contextPayload);
      assert.equal(Array.isArray(payload.messages), true);
      assert.equal(attempts[0]?.messageCount, 2);
      assert.equal(attempts[0]?.usedRepairInstruction, false);
      assert.equal('messages' in (attempts[0] ?? {}), false);
    } finally {
      if (previousEnabled === undefined) {
        delete process.env.AI_DEBUG_LOG_ENABLED;
      } else {
        process.env.AI_DEBUG_LOG_ENABLED = previousEnabled;
      }
      if (previousPath === undefined) {
        delete process.env.AI_DEBUG_LOG_PATH;
      } else {
        process.env.AI_DEBUG_LOG_PATH = previousPath;
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
