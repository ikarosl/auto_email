import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canUseDomainForOrganizationMatching,
  extractEmailDomain,
  inferCompanyNameFromEmailDomain,
} from './email-domain-policy.js';

describe('email-domain-policy', () => {
  it('extracts the domain from an email address', () => {
    assert.equal(extractEmailDomain('Buyer@CalibreRF.co.uk'), 'calibrerf.co.uk');
  });

  it('infers a company name token from a business email domain', () => {
    assert.equal(inferCompanyNameFromEmailDomain('calibrerf.co.uk'), 'calibrerf');
    assert.equal(inferCompanyNameFromEmailDomain('rfhic.com'), 'rfhic');
  });

  it('does not infer company names for public mailbox domains', () => {
    assert.equal(canUseDomainForOrganizationMatching('gmail.com'), false);
    assert.equal(inferCompanyNameFromEmailDomain('gmail.com'), undefined);
    assert.equal(inferCompanyNameFromEmailDomain('qq.com'), undefined);
  });
});
