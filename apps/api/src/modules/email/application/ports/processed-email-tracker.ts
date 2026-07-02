export interface ProcessedEmailIdentity {
  mailboxAccountId?: string;
  mailbox: string;
  uidValidity?: bigint;
  uid?: number;
  messageId?: string;
}

export interface ProcessedEmailRecord extends ProcessedEmailIdentity {
  seenAt: Date;
  processedAt?: Date;
}

export interface ProcessedEmailTracker {
  markSeen(identity: ProcessedEmailIdentity): Promise<void>;
  markProcessed(identity: ProcessedEmailIdentity): Promise<void>;
  hasSeen(identity: ProcessedEmailIdentity): Promise<boolean>;
  hasProcessed(identity: ProcessedEmailIdentity): Promise<boolean>;
  list(): Promise<ProcessedEmailRecord[]>;
}
