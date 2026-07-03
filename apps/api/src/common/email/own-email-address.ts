export function isOwnMailboxEmail(email: string): boolean {
  const normalizedEmail = normalizeEmail(email);
  const ownMailbox = normalizeEmail(process.env.IMAP_USER);
  return Boolean(normalizedEmail && ownMailbox && normalizedEmail === ownMailbox);
}

export function isOwnDomainEmail(email: string): boolean {
  const ownDomain = getOwnMailboxDomain();
  const domain = getEmailDomain(email);
  if (!ownDomain || !domain) {
    return false;
  }

  return domain === ownDomain;
}

export function isOwnEmail(email: string): boolean {
  return isOwnMailboxEmail(email) || isOwnDomainEmail(email);
}

export function getOwnMailboxDomain(): string | undefined {
  return getEmailDomain(process.env.IMAP_USER);
}

function getEmailDomain(email: string | undefined): string | undefined {
  const normalized = normalizeEmail(email);
  const domain = normalized.split('@')[1]?.trim();
  return domain || undefined;
}

function normalizeEmail(email: string | undefined): string {
  return (email ?? '').trim().toLowerCase();
}
