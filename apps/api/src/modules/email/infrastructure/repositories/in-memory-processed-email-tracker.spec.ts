import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InMemoryProcessedEmailTracker } from './in-memory-processed-email-tracker.js';

describe('InMemoryProcessedEmailTracker', () => {
  it('tracks seen and processed emails by mailbox uid', async () => {
    const tracker = new InMemoryProcessedEmailTracker();
    const identity = {
      mailbox: 'INBOX',
      uid: 42,
    };

    assert.equal(await tracker.hasSeen(identity), false);
    assert.equal(await tracker.hasProcessed(identity), false);

    await tracker.markSeen(identity);
    assert.equal(await tracker.hasSeen(identity), true);
    assert.equal(await tracker.hasProcessed(identity), false);

    await tracker.markProcessed(identity);
    assert.equal(await tracker.hasSeen(identity), true);
    assert.equal(await tracker.hasProcessed(identity), true);
  });
});
