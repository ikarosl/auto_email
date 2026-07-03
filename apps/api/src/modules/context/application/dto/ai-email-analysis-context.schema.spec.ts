import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EmailDirection } from '../../../email/domain/enums/email-direction.enum.js';
import { InquiryStatus } from '../../../inquiry/domain/enums/inquiry-status.enum.js';
import { aiEmailAnalysisContextPayloadSchema } from './ai-email-analysis-context.schema.js';

describe('aiEmailAnalysisContextPayloadSchema', () => {
  it('accepts a valid structured AI context payload', () => {
    const result = aiEmailAnalysisContextPayloadSchema.safeParse(createPayload());

    assert.equal(result.success, true);
  });

  it('rejects an invalid email direction', () => {
    const result = aiEmailAnalysisContextPayloadSchema.safeParse({
      ...createPayload(),
      currentEmail: {
        ...createPayload().currentEmail,
        direction: 'sideways',
      },
    });

    assert.equal(result.success, false);
  });

  it('rejects a current email without cleanBody', () => {
    const payload = createPayload();
    const { cleanBody: _cleanBody, ...currentEmailWithoutBody } = payload.currentEmail;
    const result = aiEmailAnalysisContextPayloadSchema.safeParse({
      ...payload,
      currentEmail: currentEmailWithoutBody,
    });

    assert.equal(result.success, false);
  });
});

function createPayload() {
  return {
    inquiryState: {
      status: InquiryStatus.NEW,
      customerEmail: 'buyer@example.com',
      subject: 'RF isolator inquiry',
      latestMessageAt: '2026-07-03T02:29:42.000Z',
    },
    recentThreadMessages: [
      {
        direction: EmailDirection.INBOUND,
        from: 'Buyer <buyer@example.com>',
        to: 'sales@example.com',
        subject: 'RF isolator inquiry',
        receivedAt: '2026-07-03T02:13:25.000Z',
        cleanBody: 'Please quote 50 pcs.',
      },
    ],
    ragReferences: [],
    currentEmail: {
      direction: EmailDirection.INBOUND,
      from: 'Buyer <buyer@example.com>',
      to: 'sales@example.com',
      subject: 'Re: RF isolator inquiry',
      receivedAt: '2026-07-03T02:29:42.000Z',
      cleanBody: 'We accept the price.',
    },
    outputInstruction: {
      format: 'json_only',
      schema: {
        isInquiry: 'boolean',
      },
    },
  };
}
