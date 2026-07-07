/**
 * EmailThread — 邮件线程实体
 *
 * 一个 EmailThread 包含归属于同一线程的多封邮件。
 * threadKey 使用外部 Message-ID（inReplyTo/references 链的根）作为业务键，
 * 用于在 (mailboxAccountId, threadKey) 上做去重。
 */

export interface EmailThread {
  id: string;
  mailboxAccountId: string;
  threadKey: string;
  externalThreadId?: string;
  subjectNormalized?: string;
  customerEmail?: string;
  latestMessageAt?: Date;
}
