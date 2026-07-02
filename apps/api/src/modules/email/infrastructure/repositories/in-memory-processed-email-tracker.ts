import {
  ProcessedEmailIdentity,
  ProcessedEmailRecord,
  ProcessedEmailTracker,
} from '../../application/ports/processed-email-tracker.js';

export class InMemoryProcessedEmailTracker implements ProcessedEmailTracker {
  private readonly records = new Map<string, ProcessedEmailRecord>();

  async markSeen(identity: ProcessedEmailIdentity): Promise<void> {
    const key = getIdentityKey(identity);
    const existing = this.records.get(key);
    this.records.set(key, {
      ...identity,
      seenAt: existing?.seenAt ?? new Date(),
      processedAt: existing?.processedAt,
    });
  }

  async markProcessed(identity: ProcessedEmailIdentity): Promise<void> {
    const key = getIdentityKey(identity);
    const existing = this.records.get(key);
    this.records.set(key, {
      ...identity,
      seenAt: existing?.seenAt ?? new Date(),
      processedAt: new Date(),
    });
  }

  async hasSeen(identity: ProcessedEmailIdentity): Promise<boolean> {
    return this.records.has(getIdentityKey(identity));
  }

  async hasProcessed(identity: ProcessedEmailIdentity): Promise<boolean> {
    return Boolean(this.records.get(getIdentityKey(identity))?.processedAt);
  }

  async list(): Promise<ProcessedEmailRecord[]> {
    return Array.from(this.records.values());
  }
}

function getIdentityKey(identity: ProcessedEmailIdentity): string {
  if (identity.uid !== undefined) {
    return [
      'uid',
      identity.mailboxAccountId ?? 'default-account',
      identity.mailbox,
      String(identity.uidValidity ?? BigInt(0)),
      String(identity.uid),
    ].join(':');
  }

  if (identity.messageId) {
    return `message-id:${identity.messageId}`;
  }

  throw new Error('Processed email identity requires messageId or uid.');
}
