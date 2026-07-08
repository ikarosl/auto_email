<script setup lang="ts">
import { WEB_ROUTES, type InquiryListItem } from '@email-inquiry/shared';
import { RefreshCcw } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { fetchInquiries } from '@/api/backend';
import Card from '@/components/ui/Card.vue';
import EmptyState from '@/components/workbench/EmptyState.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import StatusPill from '@/components/workbench/StatusPill.vue';
import { formatDateTime } from '@/lib/format';

const loading = ref(false);
const error = ref('');
const items = ref<InquiryListItem[]>([]);
const total = ref(0);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchInquiries({ page: 1, limit: 50 });
    items.value = result.data;
    total.value = result.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section>
    <PageHeader
      title="询盘机会"
      description="只读查看询盘状态、客户、最新邮件和上下文/AI 记录数量。"
      :loading="loading"
      @refresh="load"
    >
      <template #action>
        <RefreshCcw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
        刷新
      </template>
    </PageHeader>

    <Card v-if="error" class="mb-4 border-red-200 bg-red-50 p-4 text-red-700">{{ error }}</Card>

    <Card class="overflow-hidden">
      <div class="border-b border-border px-4 py-3 text-sm text-muted-foreground">共 {{ total }} 条</div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[980px] text-left text-sm">
          <thead class="border-b border-border bg-muted/60 text-muted-foreground">
            <tr>
              <th class="px-4 py-3 font-medium">主题</th>
              <th class="px-4 py-3 font-medium">客户</th>
              <th class="px-4 py-3 font-medium">状态</th>
              <th class="px-4 py-3 font-medium">产品</th>
              <th class="px-4 py-3 font-medium">邮件/AI/上下文</th>
              <th class="px-4 py-3 font-medium">最新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id" class="border-b border-border last:border-0 hover:bg-muted/40">
              <td class="max-w-[320px] px-4 py-3">
                <RouterLink class="font-medium hover:underline" :to="`${WEB_ROUTES.inquiries}/${item.id}`">
                  {{ item.subject || '(no subject)' }}
                </RouterLink>
              </td>
              <td class="px-4 py-3">
                <div>{{ item.customer?.name || item.customer?.email || '-' }}</div>
                <div class="text-xs text-muted-foreground">{{ item.customer?.email }}</div>
              </td>
              <td class="px-4 py-3"><StatusPill :status="String(item.status)" /></td>
              <td class="px-4 py-3 text-muted-foreground">{{ item.productType || '-' }}</td>
              <td class="px-4 py-3 text-muted-foreground">
                {{ item.counts?.inquiryMessages ?? 0 }} /
                {{ item.counts?.aiDecisions ?? 0 }} /
                {{ item.counts?.contextSnapshots ?? 0 }}
              </td>
              <td class="px-4 py-3 text-muted-foreground">{{ formatDateTime(item.latestMessageAt) }}</td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-if="!loading && items.length === 0">暂无询盘</EmptyState>
      </div>
    </Card>
  </section>
</template>
