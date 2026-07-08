import { createRouter, createWebHistory } from 'vue-router';
import { WEB_ROUTES } from '@email-inquiry/shared';

import AiRecordsView from '@/views/AiRecordsView.vue';
import ContextSnapshotsView from '@/views/ContextSnapshotsView.vue';
import CustomersView from '@/views/CustomersView.vue';
import InquiryDetailView from '@/views/InquiryDetailView.vue';
import InquiryListView from '@/views/InquiryListView.vue';
import ThreadListView from '@/views/ThreadListView.vue';
import WorkbenchView from '@/views/WorkbenchView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: WEB_ROUTES.workbench,
      name: 'workbench',
      component: WorkbenchView,
    },
    {
      path: WEB_ROUTES.threads,
      name: 'threads',
      component: ThreadListView,
    },
    {
      path: WEB_ROUTES.inquiries,
      name: 'inquiries',
      component: InquiryListView,
    },
    {
      path: `${WEB_ROUTES.inquiries}/:id`,
      name: 'inquiry-detail',
      component: InquiryDetailView,
    },
    {
      path: WEB_ROUTES.customers,
      name: 'customers',
      component: CustomersView,
    },
    {
      path: WEB_ROUTES.contexts,
      name: 'contexts',
      component: ContextSnapshotsView,
    },
    {
      path: WEB_ROUTES.ai,
      name: 'ai-records',
      component: AiRecordsView,
    },
    {
      path: WEB_ROUTES.drafts,
      redirect: WEB_ROUTES.ai,
    },
  ],
});
