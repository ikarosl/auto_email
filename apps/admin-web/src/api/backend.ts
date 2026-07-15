/**
 * API 接口统一导出
 *
 * 按前端路由拆分为独立模块：
 * - health.ts     → / （工作台）
 * - inquiry.ts    → /inquiries, /inquiries/:id
 * - customer.ts   → /customers
 * - thread.ts     → /email-threads
 * - context.ts    → /context-snapshots
 * - ai-record.ts  → /ai （AI 记录 + 回复草稿）
 * - shared.ts      → 通用类型与工具函数
 */
export { fetchHealth } from './health';
export type { HealthResponse } from './shared';

export {
  createManualEmail,
  fetchInquiries,
  fetchInquiry,
  fetchInquiryMessages,
  fetchInquiryThread,
  fetchMessage,
  linkMessageToInquiry,
  moveInquiryMessage,
  transitionInquiryStatus,
  updateInquiry,
} from './inquiry';

export { fetchCustomers, updateCustomer } from './customer';

export { fetchEmailThreadMessages, fetchEmailThreads } from './thread';

export { fetchContextSnapshot, fetchContextSnapshots } from './context';

export {
  approveReplyDraft,
  createReplyDraft,
  fetchAiDecisions,
  fetchMailRuntime,
  fetchReplyDraft,
  fetchReplyDrafts,
  regenerateReplyDraft,
  rejectReplyDraft,
  sendReplyDraft,
  updateReplyDraft,
} from './ai-record';

export type { ListParams } from './shared';

export {
  applyWorkflowDecision,
  fetchInquiryWorkflowDecisions,
  rejectWorkflowDecision,
} from './workflow-decision';
