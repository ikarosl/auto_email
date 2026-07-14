import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aiReplyDraftSchema } from './ai-reply-draft.schema.js';

describe('aiReplyDraftSchema', () => {
  it('accepts a review-only structured draft', () => {
    const result = aiReplyDraftSchema.safeParse({
      draftType: 'clarification_request',
      subject: 'Re: RF inquiry',
      bodyText: 'Please confirm the operating frequency.',
      language: 'en',
      usedFacts: ['Customer requested an RF circulator'],
      unresolvedQuestions: ['Operating frequency'],
      warnings: [],
      requiresCommercialReview: false,
      humanReviewRequired: true,
    });
    assert.equal(result.success, true);
  });

  it('rejects a draft that claims human review is unnecessary', () => {
    const result = aiReplyDraftSchema.safeParse({
      draftType: 'general_reply',
      subject: 'Reply',
      bodyText: 'Body',
      language: 'en',
      usedFacts: [],
      unresolvedQuestions: [],
      warnings: [],
      requiresCommercialReview: false,
      humanReviewRequired: false,
    });
    assert.equal(result.success, false);
  });
});
