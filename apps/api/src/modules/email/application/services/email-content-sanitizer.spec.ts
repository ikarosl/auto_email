import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EmailContentSanitizer } from './email-content-sanitizer.js';

describe('EmailContentSanitizer', () => {
  const sanitizer = new EmailContentSanitizer();

  it('converts HTML-only email content to readable plain text', () => {
    const result = sanitizer.sanitize(
      undefined,
      '<html><style>.hidden { display: none; }</style><body><p>Need&nbsp;an RF circulator.</p><div>Quantity: 50 &amp; urgent</div></body></html>',
    );

    assert.equal(result, 'Need an RF circulator.\nQuantity: 50 & urgent');
  });

  it('uses decoded plain text without treating its characters as HTML entities', () => {
    const result = sanitizer.sanitize(
      'The literal product code is RF&amp;MW <sample>.',
      '<p>This alternative must not replace the plain text.</p>',
    );

    assert.equal(result, 'The literal product code is RF&amp;MW <sample>.');
  });

  it('prefers the HTML representation when it contains a table', () => {
    const result = sanitizer.sanitize(
      'Product requirements are attached as a table.',
      [
        '<p>Product requirements:</p>',
        '<table>',
        '<tr><th>Parameter</th><th>Value</th></tr>',
        '<tr><td>Frequency</td><td>12-15GHz</td></tr>',
        '<tr><td>Quantity</td><td>50 pcs</td></tr>',
        '</table>',
      ].join(''),
    );

    assert.match(result ?? '', /Parameter\s+Value/);
    assert.match(result ?? '', /Frequency\s+12-15GHz/);
    assert.match(result ?? '', /Quantity\s+50 pcs/);
    assert.doesNotMatch(result ?? '', /attached as a table/);
  });

  it('removes quoted reply history and keeps the new message', () => {
    const result = sanitizer.sanitize([
      'The required frequency is 12-15GHz.',
      '',
      'On Tue, Jun 23, 2026 at 10:00 AM Sales <sales@example.com> wrote:',
      '> Which frequency range do you need?',
      '> Please also provide the quantity.',
    ].join('\r\n'));

    assert.equal(result, 'The required frequency is 12-15GHz.');
  });

  it('removes an HTML gmail quote before converting the body', () => {
    const result = sanitizer.sanitize(
      undefined,
      [
        '<p>Please update the quantity to 100 pcs.</p>',
        '<div class="gmail_quote">',
        '<p>Previous message: quantity 50 pcs.</p>',
        '</div>',
      ].join(''),
    );

    assert.equal(result, 'Please update the quantity to 100 pcs.');
  });

  it('removes an HTML blockquote before converting the body', () => {
    const result = sanitizer.sanitize(
      undefined,
      '<p>Current reply.</p><blockquote><p>Previous reply.</p></blockquote>',
    );

    assert.equal(result, 'Current reply.');
  });

  it('removes a complete mail header block using the scoring rules', () => {
    const result = sanitizer.sanitize([
      'Thank you for following up.',
      'We reviewed the current requirement.',
      'The order has now been cancelled.',
      '',
      'From: sales@example.com',
      'Sent: Tuesday, June 23, 2026',
      'To: buyer@example.com',
      'Subject: RF isolator inquiry',
      'Previous message body.',
    ].join('\n'));

    assert.equal(
      result,
      [
        'Thank you for following up.',
        'We reviewed the current requirement.',
        'The order has now been cancelled.',
      ].join('\n'),
    );
  });

  it('keeps mail headers near the beginning of the body', () => {
    const result = sanitizer.sanitize([
      'From: buyer@example.com',
      'Sent: Wednesday, June 24, 2026',
      'To: sales@example.com',
      'Subject: RF isolator inquiry',
      '',
      'Please quote 50 pcs.',
    ].join('\n'));

    assert.equal(
      result,
      [
        'From: buyer@example.com',
        'Sent: Wednesday, June 24, 2026',
        'To: sales@example.com',
        'Subject: RF isolator inquiry',
        '',
        'Please quote 50 pcs.',
      ].join('\n'),
    );
  });

  it('keeps quoted headers after an extremely short reply', () => {
    const result = sanitizer.sanitize([
      'OK.',
      '',
      'From: sales@example.com',
      'Sent: Tuesday, June 23, 2026',
      'To: buyer@example.com',
      'Subject: RF isolator inquiry',
      'Previous message body.',
    ].join('\n'));

    assert.match(result ?? '', /From: sales@example\.com/);
  });

  it('keeps a weak From signal below the score threshold', () => {
    const result = sanitizer.sanitize([
      'Shipping requirements:',
      'From: sales@example.com',
      'Warehouse: Shanghai',
      'Quantity: 20 pcs',
    ].join('\n'));

    assert.equal(
      result,
      'Shipping requirements:\nFrom: sales@example.com\nWarehouse: Shanghai\nQuantity: 20 pcs',
    );
  });

  it('removes three consecutive quoted lines but keeps one quoted business line', () => {
    const quotedHistory = sanitizer.sanitize([
      'Current reply.',
      '> Previous line one',
      '> Previous line two',
      '> Previous line three',
    ].join('\n'));
    const businessText = sanitizer.sanitize([
      'Required marking:',
      '> FRONT',
      'Quantity: 20 pcs',
    ].join('\n'));

    assert.equal(quotedHistory, 'Current reply.');
    assert.equal(businessText, 'Required marking:\n> FRONT\nQuantity: 20 pcs');
  });

  it('removes a trailing signature and disclaimer', () => {
    const result = sanitizer.sanitize([
      'Please quote 50 pcs.',
      '',
      'Best regards,',
      'John Smith',
      'Example Corporation',
      'Confidentiality Notice: this email is confidential.',
    ].join('\n'));

    assert.equal(result, 'Please quote 50 pcs.');
  });

  it('does not remove ordinary business content containing a From label', () => {
    const result = sanitizer.sanitize([
      'Ship from: Shanghai',
      'Deliver to: Shenzhen',
      'Quantity: 20 pcs',
    ].join('\n'));

    assert.equal(result, 'Ship from: Shanghai\nDeliver to: Shenzhen\nQuantity: 20 pcs');
  });
});
