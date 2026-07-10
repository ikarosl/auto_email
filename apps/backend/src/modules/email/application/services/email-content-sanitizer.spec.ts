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

    assert.equal(result.cleaned, 'Need an RF circulator.\nQuantity: 50 & urgent');
    assert.equal(result.quotedHistory, undefined);
  });

  it('uses decoded plain text without treating its characters as HTML entities', () => {
    const result = sanitizer.sanitize(
      'The literal product code is RF&amp;MW <sample>.',
      '<p>This alternative must not replace the plain text.</p>',
    );

    assert.equal(result.cleaned, 'The literal product code is RF&amp;MW <sample>.');
    assert.equal(result.quotedHistory, undefined);
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
      ].join(''),
    );

    assert.match(result.cleaned ?? '', /Parameter\s+Value/);
    assert.match(result.cleaned ?? '', /Frequency\s+12-15GHz/);
    assert.match(result.cleaned ?? '', /Quantity\s+50 pcs/);
    assert.doesNotMatch(result.cleaned ?? '', /attached as a table/);
    assert.equal(result.quotedHistory, undefined);
  });

  it('removes quoted reply history and keeps the new message', () => {
    const result = sanitizer.sanitize([
      'The required frequency is 12-15GHz.',
      '',
      'On Tue, Jun 23, 2026 at 10:00 AM Sales <sales@example.com> wrote:',
      '> Which frequency range do you need?',
      '> Please also provide the quantity.',
    ].join('\r\n'));

    assert.equal(result.cleaned, 'The required frequency is 12-15GHz.');
    assert.ok(result.quotedHistory?.includes('wrote'));
  });

  it('removes Chinese wrote reply history and keeps the new message', () => {
    const result = sanitizer.sanitize([
      '我们接受 4 到 6 周交期。',
      '',
      '销售 <silent@hzbeat.com> 在 2026年7月3日 周五 10:16 写道：',
      '我们有现货方案可以满足需求。',
    ].join('\n'));

    assert.equal(result.cleaned, '我们接受 4 到 6 周交期。');
    assert.ok(result.quotedHistory?.includes('写道'));
  });

  it('removes reply attribution lines with email, date, and localized wrote signal', () => {
    const chinese = sanitizer.sanitize([
      'Current reply: please proceed with the quotation.',
      '',
      '(Dennis kim) <dykim@rfhic.com> 在 2026年6月22日 周一 17:47 写道：',
      'Previous inquiry body.',
    ].join('\n'));
    const italian = sanitizer.sanitize([
      'Current reply: accepted.',
      '',
      'Il 26/06/2026 03:51 CEST Hzbeat <sales@hzbeat.com> ha scritto:',
      'Previous reply body.',
    ].join('\n'));
    const english = sanitizer.sanitize([
      'Current reply: contract received.',
      '',
      'On 2 Jul 2026 at 8:42 am, Shira <shira@hzbeat.com> wrote:',
      'Previous reply body.',
    ].join('\n'));

    assert.equal(chinese.cleaned, 'Current reply: please proceed with the quotation.');
    assert.equal(italian.cleaned, 'Current reply: accepted.');
    assert.equal(english.cleaned, 'Current reply: contract received.');
  });

  it('does not remove a business line that has email and date but no reply attribution verb', () => {
    const result = sanitizer.sanitize([
      'Schedule:',
      'Please contact buyer@example.com before 2 Jul 2026 for delivery confirmation.',
      'Quantity: 50 pcs.',
    ].join('\n'));

    assert.equal(
      result.cleaned,
      [
        'Schedule:',
        'Please contact buyer@example.com before 2 Jul 2026 for delivery confirmation.',
        'Quantity: 50 pcs.',
      ].join('\n'),
    );
    assert.equal(result.quotedHistory, undefined);
  });

  it('keeps ordinary UTF-8 Chinese body text', () => {
    const result = sanitizer.sanitize([
      '这是一封新的询盘邮件。',
      '频率范围：12-15GHz。',
      '数量：50 件。',
    ].join('\n'));

    assert.equal(result.cleaned, '这是一封新的询盘邮件。\n频率范围：12-15GHz。\n数量：50 件。');
    assert.equal(result.quotedHistory, undefined);
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

    assert.equal(result.cleaned, 'Please update the quantity to 100 pcs.');
  });

  it('removes an HTML blockquote before converting the body', () => {
    const result = sanitizer.sanitize(
      undefined,
      '<p>Current reply.</p><blockquote><p>Previous reply.</p></blockquote>',
    );

    assert.equal(result.cleaned, 'Current reply.');
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
      result.cleaned,
      [
        'Thank you for following up.',
        'We reviewed the current requirement.',
        'The order has now been cancelled.',
      ].join('\n'),
    );
    assert.ok(result.quotedHistory?.includes('From: sales@example.com'));
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
      result.cleaned,
      [
        'From: buyer@example.com',
        'Sent: Wednesday, June 24, 2026',
        'To: sales@example.com',
        'Subject: RF isolator inquiry',
        '',
        'Please quote 50 pcs.',
      ].join('\n'),
    );
    assert.equal(result.quotedHistory, undefined);
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

    assert.match(result.cleaned ?? '', /From: sales@example\.com/);
  });

  it('keeps a weak From signal below the score threshold', () => {
    const result = sanitizer.sanitize([
      'Shipping requirements:',
      'From: sales@example.com',
      'Warehouse: Shanghai',
      'Quantity: 20 pcs',
    ].join('\n'));

    assert.equal(
      result.cleaned,
      'Shipping requirements:\nFrom: sales@example.com\nWarehouse: Shanghai\nQuantity: 20 pcs',
    );
    assert.equal(result.quotedHistory, undefined);
  });

  it('removes three consecutive quoted lines but keeps one quoted business line', () => {
    const quotedResult = sanitizer.sanitize([
      'Current reply.',
      '> Previous line one',
      '> Previous line two',
      '> Previous line three',
    ].join('\n'));
    const businessResult = sanitizer.sanitize([
      'Required marking:',
      '> FRONT',
      'Quantity: 20 pcs',
    ].join('\n'));

    assert.equal(quotedResult.cleaned, 'Current reply.');
    assert.ok(quotedResult.quotedHistory?.includes('Previous line'));
    assert.equal(businessResult.cleaned, 'Required marking:\n> FRONT\nQuantity: 20 pcs');
    assert.equal(businessResult.quotedHistory, undefined);
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

    assert.equal(result.cleaned, 'Please quote 50 pcs.');
  });

  it('does not remove ordinary business content containing a From label', () => {
    const result = sanitizer.sanitize([
      'Ship from: Shanghai',
      'Deliver to: Shenzhen',
      'Quantity: 20 pcs',
    ].join('\n'));

    assert.equal(result.cleaned, 'Ship from: Shanghai\nDeliver to: Shenzhen\nQuantity: 20 pcs');
    assert.equal(result.quotedHistory, undefined);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
