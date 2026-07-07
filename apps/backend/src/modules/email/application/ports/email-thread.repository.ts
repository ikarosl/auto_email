import { EmailThread } from '../../domain/entities/email-thread.entity.js';

export interface CreateEmailThreadParams {
  id: string;
  mailboxAccountId: string;
  threadKey: string;
  externalThreadId?: string;
  subjectNormalized?: string;
  customerEmail?: string;
  latestMessageAt?: Date;
}

export interface EmailThreadRepository {
  /** 按 (mailboxAccountId, threadKey) 查找已有线程 */
  findByThreadKey(mailboxAccountId: string, threadKey: string): Promise<EmailThread | null>;

  /** 创建新线程 */
  create(params: CreateEmailThreadParams): Promise<EmailThread>;
}
