import { defineStore } from 'pinia';

import { fetchHealth, fetchInquiries, type HealthResponse, type InquiryCase } from '@/api/backend';

export const useWorkbenchStore = defineStore('workbench', {
  state: () => ({
    health: undefined as HealthResponse | undefined,
    inquiries: [] as InquiryCase[],
    loading: false,
    loadingStep: '',
    loadProgress: 0,
    error: '',
    lastLoadedAt: undefined as Date | undefined,
  }),
  getters: {
    totalInquiries: (state) => state.inquiries.length,
    invalidInquiries: (state) =>
      state.inquiries.filter((item) => item.status === 'invalid').length,
    activeInquiries: (state) =>
      state.inquiries.filter((item) => item.status !== 'invalid' && item.status !== 'closed')
        .length,
  },
  actions: {
    async refresh() {
      this.loading = true;
      this.error = '';
      this.loadingStep = '连接后端服务';
      this.loadProgress = 18;

      try {
        this.health = await fetchHealth();
        this.loadingStep = '读取询盘列表';
        this.loadProgress = 62;
        this.inquiries = await fetchInquiries();
        this.loadingStep = '整理工作台数据';
        this.loadProgress = 100;
        this.lastLoadedAt = new Date();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
        window.setTimeout(() => {
          if (!this.loading) {
            this.loadingStep = '';
            this.loadProgress = 0;
          }
        }, 500);
      }
    },
  },
});
