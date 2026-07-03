import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('removes Chinese wrote reply history and keeps the new message', () => {
    const result = sanitizer.sanitize([
      '我们接受 4 到 6 周交期。',
      '',
      '销售 <silent@hzbeat.com> 在 2026年7月3日 周五 10:16 写道：',
      '我们有现货方案可以满足需求。',
    ].join('\n'));

    assert.equal(result, '我们接受 4 到 6 周交期。');
  });

  it('keeps ordinary UTF-8 Chinese body text', () => {
    const result = sanitizer.sanitize([
      '这是一封新的询盘邮件。',
      '频率范围：12-15GHz。',
      '数量：50 件。',
    ].join('\n'));

    assert.equal(result, '这是一封新的询盘邮件。\n频率范围：12-15GHz。\n数量：50 件。');
  });

  it('writes original sanitizer input diagnostics before quote matching when enabled', () => {
    const previousEnabled = process.env.EMAIL_SANITIZER_DEBUG_LOG_ENABLED;
    const previousPath = process.env.EMAIL_SANITIZER_DEBUG_LOG_PATH;
    const tempDir = mkdtempSync(join(tmpdir(), 'email-sanitizer-'));
    const logPath = join(tempDir, 'debug.jsonl');
    process.env.EMAIL_SANITIZER_DEBUG_LOG_ENABLED = 'true';
    process.env.EMAIL_SANITIZER_DEBUG_LOG_PATH = logPath;

    try {
      const originalText = [
        '我们接受 4 到 6 周交期。',
        '',
        '销售 <silent@hzbeat.com> 在 2026年7月3日 写道：',
        '上一封历史邮件。',
      ].join('\n');

      sanitizer.sanitize(originalText, undefined, {
        emailMessageId: 'email_debug_001',
        externalMessageId: 'message_debug_001',
        fromEmail: 'buyer@example.com',
        subject: 'Re: RF inquiry',
        sourceKind: 'imap',
      });

      const entry = JSON.parse(readFileSync(logPath, 'utf8')) as {
        emailMessageId: string;
        selectedTextOriginal: string;
        selectedTextOriginalUtf8Base64: string;
        linesOriginal: Array<{ text: string; codePoints: string[] }>;
      };

      assert.equal(entry.emailMessageId, 'email_debug_001');
      assert.equal(entry.selectedTextOriginal, originalText);
      assert.equal(
        Buffer.from(entry.selectedTextOriginalUtf8Base64, 'base64').toString('utf8'),
        originalText,
      );
      assert.equal(entry.linesOriginal[2]?.text, '销售 <silent@hzbeat.com> 在 2026年7月3日 写道：');
      assert.ok(entry.linesOriginal[2]?.codePoints.includes('U+5728'));
      assert.ok(entry.linesOriginal[2]?.codePoints.includes('U+5199'));
    } finally {
      restoreEnv('EMAIL_SANITIZER_DEBUG_LOG_ENABLED', previousEnabled);
      restoreEnv('EMAIL_SANITIZER_DEBUG_LOG_PATH', previousPath);
      rmSync(tempDir, { recursive: true, force: true });
    }
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

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
