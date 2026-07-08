<script setup lang="ts">
import type { InquiryListItem } from '@email-inquiry/shared';
import { ArrowLeft, RefreshCcw } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { WEB_ROUTES } from '@email-inquiry/shared';

import { fetchInquiry } from '@/api/backend';
import Badge from '@/components/ui/Badge.vue';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import JsonBlock from '@/components/workbench/JsonBlock.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import StatusPill from '@/components/workbench/StatusPill.vue';
import { formatDateTime } from '@/lib/format';

const route = useRoute();
const loading = ref(false);
const error = ref('');
const item = ref<InquiryListItem | null>(null);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    item.value = await fetchInquiry(String(route.params.id));
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="space-y-4">
    <RouterLink :to="WEB_ROUTES.inquiries">
      <Button variant="ghost" size="sm"><ArrowLeft class="h-4 w-4" /> 返回询盘列表</Button>
    </RouterLink>

    <PageHeader
      title="询盘详情"
      :description="item?.subject || '查看询盘状态、客户信息、结构化事实和上下文摘要。'"
      :loading="loading"
      @refresh="load"
    >
      <template #action>
        <RefreshCcw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
        刷新
      </template>
    </PageHeader>

    <Card v-if="error" class="border-red-200 bg-red-50 p-4 text-red-700">{{ error }}</Card>

    <div v-if="item" class="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card class="p-4">
        <div class="space-y-4">
          <div>
            <div class="text-sm text-muted-foreground">当前状态</div>
            <div class="mt-2"><StatusPill :status="String(item.status)" /></div>
          </div>
          <div>
            <div class="text-sm text-muted-foreground">客户</div>
            <div class="mt-1 font-medium">{{ item.customer?.name || item.customer?.email }}</div>
            <div class="text-sm text-muted-foreground">{{ item.customer?.email }}</div>
          </div>
          <div>
            <div class="text-sm text-muted-foreground">最新邮件时间</div>
            <div class="mt-1">{{ formatDateTime(item.latestMessageAt) }}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <Badge tone="muted">邮件 {{ item.counts?.inquiryMessages ?? 0 }}</Badge>
            <Badge tone="muted">AI {{ item.counts?.aiDecisions ?? 0 }}</Badge>
            <Badge tone="muted">快照 {{ item.counts?.contextSnapshots ?? 0 }}</Badge>
          </div>
        </div>
      </Card>

      <div class="space-y-4">
        <Card class="p-4">
          <h2 class="font-semibold">结构化事实</h2>
          <div class="mt-3"><JsonBlock :value="item.structuredFacts || {}" /></div>
        </Card>
        <Card class="p-4">
          <h2 class="font-semibold">滚动摘要</h2>
          <div class="mt-3"><JsonBlock :value="item.contextSummary || {}" /></div>
        </Card>
        <Card class="p-4">
          <h2 class="font-semibold">状态日志</h2>
          <div class="mt-3"><JsonBlock :value="item.statusLogs || []" /></div>
        </Card>
      </div>
    </div>
  </section>
</template>
