export const API_ROUTE_SEGMENTS = {
  health: 'health',
  inquiries: 'inquiries',
  inquiryMessages: 'inquiry-messages',
  customers: 'customers',
  organizations: 'organizations',
  emailThreads: 'email-threads',
  messages: 'messages',
  contextSnapshots: 'context-snapshots',
  aiDecisions: 'ai-decisions',
  replyDrafts: 'reply-drafts',
  runtimeConfig: 'runtime-config',
  emailWorkflowDecisions: 'email-workflow-decisions',
} as const;

export const WEB_ROUTES = {
  workbench: '/',
  threads: '/threads',
  inquiries: '/inquiries',
  customers: '/customers',
  organizations: '/organizations',
  contexts: '/contexts',
  ai: '/ai',
  drafts: '/drafts',
} as const;

export type WebRoutePath = (typeof WEB_ROUTES)[keyof typeof WEB_ROUTES];
