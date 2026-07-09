const PUBLIC_EMAIL_DOMAINS = new Set([
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
  'protonmail.com',
]);

export function extractEmailDomain(email: string | undefined): string | undefined {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return undefined;
  }

  const domain = normalized.split('@').pop()?.trim();
  return domain || undefined;
}

export function canUseDomainForOrganizationMatching(domain: string | undefined): domain is string {
  if (!domain) {
    return false;
  }

  return !PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

export function getPublicEmailDomains(): string[] {
  return Array.from(PUBLIC_EMAIL_DOMAINS);
}
