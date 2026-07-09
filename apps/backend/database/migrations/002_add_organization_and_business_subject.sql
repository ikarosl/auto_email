CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY DEFAULT ('org_' || gen_random_uuid()::TEXT),
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'merged')),
  source TEXT NOT NULL DEFAULT 'email_domain',
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS organizations_domain_idx ON organizations(domain);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations(status);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customers_domain_idx ON customers(domain);
CREATE INDEX IF NOT EXISTS customers_organization_idx ON customers(organization_id);

ALTER TABLE inquiry_cases
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_subject TEXT,
  ADD COLUMN IF NOT EXISTS business_subject TEXT,
  ADD COLUMN IF NOT EXISTS business_subject_source TEXT NOT NULL DEFAULT 'raw_email',
  ADD COLUMN IF NOT EXISTS business_subject_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS business_subject_updated_at TIMESTAMPTZ;

ALTER TABLE inquiry_cases
  DROP CONSTRAINT IF EXISTS inquiry_cases_business_subject_source_check;

ALTER TABLE inquiry_cases
  ADD CONSTRAINT inquiry_cases_business_subject_source_check
  CHECK (business_subject_source IN ('raw_email', 'ai_generated', 'human'));

CREATE INDEX IF NOT EXISTS inquiry_cases_organization_idx ON inquiry_cases(organization_id);
CREATE INDEX IF NOT EXISTS inquiry_cases_primary_customer_idx ON inquiry_cases(primary_customer_id);

UPDATE customers
SET domain = lower(split_part(email, '@', 2))
WHERE domain IS NULL
  AND position('@' IN email) > 0;

INSERT INTO organizations (domain, name, source)
SELECT DISTINCT domain, domain, 'email_domain'
FROM customers
WHERE domain IS NOT NULL
  AND domain NOT IN (
    'gmail.com',
    'googlemail.com',
    'qq.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'msn.com',
    'yahoo.com',
    '163.com',
    '126.com',
    'icloud.com',
    'me.com',
    'aol.com',
    'proton.me',
    'protonmail.com'
  )
ON CONFLICT (domain) DO NOTHING;

UPDATE customers c
SET organization_id = o.id,
    updated_at = now()
FROM organizations o
WHERE c.organization_id IS NULL
  AND c.domain = o.domain;

UPDATE inquiry_cases i
SET organization_id = c.organization_id,
    primary_customer_id = i.customer_id,
    raw_subject = COALESCE(i.raw_subject, i.subject),
    business_subject = COALESCE(i.business_subject, i.subject),
    business_subject_updated_at = COALESCE(i.business_subject_updated_at, now())
FROM customers c
WHERE i.customer_id = c.id;
