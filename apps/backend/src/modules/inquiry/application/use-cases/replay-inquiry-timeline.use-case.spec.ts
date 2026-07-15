import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EmailDirection } from '../../../email/domain/enums/email-direction.enum.js';
import { EmailSource } from '../../../email/domain/enums/email-source.enum.js';
import { ReplayInquiryTimelineUseCase } from './replay-inquiry-timeline.use-case.js';

describe('ReplayInquiryTimelineUseCase', () => {
  it('keeps manual mode when a replayed email cannot be analyzed', async () => {
    const email = {
      id: 'email_multi',
      externalMessageId: '<multi@example.com>',
      direction: EmailDirection.INBOUND,
      source: EmailSource.IMAP,
      fromEmail: 'buyer@example.com',
      toEmails: ['sales@example.com'],
      ccEmails: [],
      subject: 'Two products',
      bodyText: 'Please quote a circulator and an independent filter.',
      receivedAt: new Date('2026-07-01T08:00:00.000Z'),
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
    };
    let replayRunStatus = '';
    let inquiryUpdated = false;
    const prisma = {
      inquiryProcessingModeTransition: {
        findFirst: async () => ({
          sourceEmailMessageId: email.id,
          changedAt: email.receivedAt,
          beforeStateJson: {
            businessStage: 'intake',
            actionOwner: 'us',
            lifecycleStatus: 'active',
            stateVersion: 0,
          },
        }),
      },
      inquiryReplayRun: {
        create: async ({ data }: any) => data,
        update: async ({ data }: any) => { replayRunStatus = data.status; return data; },
      },
      inquiryStateTransition: { findMany: async () => [] },
      inquiryCase: { updateMany: async () => { inquiryUpdated = true; return { count: 1 }; } },
    };
    const useCase = new ReplayInquiryTimelineUseCase(
      prisma as any,
      { findById: async () => ({
        id: 'inquiry_1',
        customerEmail: 'buyer@example.com',
        subject: 'Inquiry',
        businessStage: 'intake',
        actionOwner: 'us',
        lifecycleStatus: 'active',
        stateVersion: 0,
        processingMode: 'manual',
        latestMessageAt: email.receivedAt,
        createdAt: email.receivedAt,
        updatedAt: email.receivedAt,
      }) } as any,
      { listByInquiryCaseId: async () => [{ emailMessageId: email.id }] } as any,
      { findById: async () => email } as any,
      { execute: async () => ({
        kind: 'email_analysis',
        analysisResult: {
          success: false,
          errorCode: 'ai_validation_failed',
          message: 'invalid output',
          humanReviewRequired: true,
        },
      }) } as any,
    );

    await useCase.execute({
      inquiryCaseId: 'inquiry_1',
      initiatedBy: 'admin',
      triggerType: 'manual_mode_restored',
    });

    assert.equal(replayRunStatus, 'failed');
    assert.equal(inquiryUpdated, false);
  });
});
