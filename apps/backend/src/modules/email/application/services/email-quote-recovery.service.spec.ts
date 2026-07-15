import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recoverParentEmailFromQuote } from './email-quote-recovery.service.js';

describe('recoverParentEmailFromQuote', () => {
  it('marks a dated direct parent with a complete body as high confidence', () => {
    const recovered = recoverParentEmailFromQuote(
      'Sales <sales@hzbeat.com> 在 2026年7月15日 10:20 写道：\n\nWe can provide the requested product. Please confirm the delivery time.',
      '<parent@example.com>',
      'Re: RF inquiry',
      'buyer@example.com',
    );
    assert.ok(recovered);
    assert.equal(recovered.confidence, 0.95);
    assert.equal(recovered.bodyComplete, true);
    assert.equal(recovered.evidence.receivedAtReliable, true);
  });

  it('keeps an attribution without a reliable date below replay confidence', () => {
    const recovered = recoverParentEmailFromQuote(
      'Sales <sales@hzbeat.com> wrote:\n\nWe can provide the requested product. Please confirm the delivery time.',
      '<parent@example.com>',
      'Re: RF inquiry',
      'buyer@example.com',
    );
    assert.ok(recovered);
    assert.equal(recovered.confidence, 0.65);
    assert.equal(recovered.evidence.receivedAtReliable, false);
  });
});
