import assert from 'node:assert/strict';
import { it } from 'node:test';

import { SimulatedEmailSenderAdapter } from './simulated-email-sender.adapter.js';

it('simulates delivery without opening SMTP', async () => {
  const result = await new SimulatedEmailSenderAdapter().send({
    fromEmail: 'sales@example.com',
    fromName: 'Sales',
    recipient: 'customer@example.net',
    subject: 'Reply',
    bodyText: 'Draft body',
    messageId: '<reply@example.com>',
    references: [],
    attachments: [],
  });
  assert.equal(result.operationMode, 'debug');
  assert.equal(result.provider, 'simulated');
  assert.equal(result.status, 'simulated');
});
