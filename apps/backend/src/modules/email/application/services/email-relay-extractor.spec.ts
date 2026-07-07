import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractContactInfoFromBody,
  isRelayDomain,
} from './email-relay-extractor.js';

describe('isRelayDomain', () => {
  it('returns true for tatasoft.com address', () => {
    assert.equal(isRelayDomain('support@tatasoft.com'), true);
  });

  it('returns true for tatasoft.com with subdomain', () => {
    assert.equal(isRelayDomain('noreply@mail.tatasoft.com'), true);
  });

  it('returns false for normal email domain', () => {
    assert.equal(isRelayDomain('buyer@example.com'), false);
  });

  it('returns false for own domain', () => {
    assert.equal(isRelayDomain('sales@hzbeat.com'), false);
  });

  it('returns false for empty string', () => {
    assert.equal(isRelayDomain(''), false);
  });

  it('returns false for email without domain', () => {
    assert.equal(isRelayDomain('invalid'), false);
  });
});

describe('extractContactInfoFromBody', () => {
  it('extracts email from compact format (tatasoft style)', () => {
    const body =
      '联系人:联系邮箱:WINDSOR.BISBEE@L3HARRIS.COM联系电话:留言内容:Hello, we need 2 circulators.';
    const result = extractContactInfoFromBody(body);
    assert.ok(result);
    assert.equal(result!.email, 'windsor.bisbee@l3harris.com');
    assert.equal(result!.name, undefined);
  });

  it('extracts both email and name when name is present', () => {
    const body =
      '联系人:John Smith联系邮箱:john@example.com联系电话:13800138000留言内容:Please quote for 100pcs.';
    const result = extractContactInfoFromBody(body);
    assert.ok(result);
    assert.equal(result!.email, 'john@example.com');
    assert.equal(result!.name, 'John Smith');
  });

  it('extracts email with newlines between fields', () => {
    const body = [
      '联系人:',
      '联系邮箱:WINDSOR.BISBEE@L3HARRIS.COM',
      '联系电话:',
      '留言内容:Hello, we are working on developing an ultra wideband.',
    ].join('\n');
    const result = extractContactInfoFromBody(body);
    assert.ok(result);
    assert.equal(result!.email, 'windsor.bisbee@l3harris.com');
  });

  it('extracts email with Chinese colons', () => {
    const body = '联系人：张三联系邮箱：zhangsan@example.com联系电话：留言内容：测试';
    const result = extractContactInfoFromBody(body);
    assert.ok(result);
    assert.equal(result!.email, 'zhangsan@example.com');
    assert.equal(result!.name, '张三');
  });

  it('returns null for normal email body without structured fields', () => {
    const body = 'Hi, we need an RF circulator. Please send quote.';
    const result = extractContactInfoFromBody(body);
    assert.equal(result, null);
  });

  it('returns null for empty body', () => {
    assert.equal(extractContactInfoFromBody(''), null);
  });

  it('returns null for undefined body', () => {
    assert.equal(extractContactInfoFromBody(undefined), null);
  });

  it('lowercases the extracted email', () => {
    const body =
      '联系人:联系邮箱:UPPERCASE.EMAIL@EXAMPLE.COM联系电话:留言内容:test';
    const result = extractContactInfoFromBody(body);
    assert.ok(result);
    assert.equal(result!.email, 'uppercase.email@example.com');
  });

  it('preserves original email as-is in bodyText', () => {
    const body =
      '联系人:Alice联系邮箱:Alice.Wang@Example.Com联系电话:留言内容:Test';
    const result = extractContactInfoFromBody(body);
    assert.ok(result);
    assert.equal(result!.email, 'alice.wang@example.com');
    assert.equal(result!.name, 'Alice');
  });
});
