<script setup lang="ts">
import type { AiDecisionListItem, ReplyDraftListItem } from '@email-inquiry/shared';
import { RefreshCcw } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';

import { fetchAiDecisions, fetchReplyDrafts } from '@/api/backend';
import Badge from '@/components/ui/Badge.vue';
import Card from '@/components/ui/Card.vue';
import EmptyState from '@/components/workbench/EmptyState.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import { formatDateTime, truncate } from '@/lib/format';

const loading = ref(false);
const error = ref('');
const decisions = ref<AiDecisionListItem[]>([]);
const drafts = ref<ReplyDraftListItem[]>([]);

function confidenceText(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value * 100)}%`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [decisionResult, draftResult] = await Promise.all([
      fetchAiDecisions({ page: 1, limit: 30 }),
      fetchReplyDrafts({ page: 1, limit: 30 }),
    ]);
    decisions.value = decisionResult.data;
    drafts.value = draftResult.data;
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
      title="AI 记录"
      description="集中查看 AI 决策记录和回复草稿；当前阶段只读，不自动发信。"
      :loading="loading"
      @refresh="load"
    >
      <template #action>
        <RefreshCcw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
        刷新
      </template>
    </PageHeader>

    <Card v-if="error" class="mb-4 border-red-200 bg-red-50 p-4 text-red-700">{{ error }}</Card>

    <div class="grid gap-4 xl:grid-cols-2">
      <Card class="overflow-hidden">
        <div class="border-b border-border px-4 py-3">
          <h2 class="font-semibold">AI 决策记录</h2>
          <p class="mt-1 text-sm text-muted-foreground">分类、建议状态、置信度和原因。</p>
        </div>
        <div class="divide-y divide-border">
          <article v-for="item in decisions" :key="item.id" class="p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <Badge :tone="item.success ? 'success' : 'danger'">{{ item.success ? 'success' : 'failed' }}</Badge>
                <Badge tone="muted">{{ item.classification || '-' }}</Badge>
                <Badge tone="warning">{{ item.suggestedStatus || '-' }}</Badge>
              </div>
              <span class="text-xs text-muted-foreground">{{ formatDateTime(item.createdAt) }}</span>
            </div>
            <div class="mt-2 text-sm">
              {{ item.emailMessage?.subject || item.inquiryCase?.subject || '(no subject)' }}
            </div>
            <div class="mt-1 text-xs text-muted-foreground">
              置信度 {{ confidenceText(item.confidence) }} · {{ item.riskLevel || 'risk unknown' }}
            </div>
            <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ item.reason || item.errorMessage || '-' }}</p>
          </article>
          <EmptyState v-if="!loading && decisions.length === 0">暂无 AI 决策记录</EmptyState>
        </div>
      </Card>

      <Card class="overflow-hidden">
        <div class="border-b border-border px-4 py-3">
          <h2 class="font-semibold">AI 回复草稿</h2>
          <p class="mt-1 text-sm text-muted-foreground">后续用于人工审核、复制和发送。</p>
        </div>
        <div class="divide-y divide-border">
          <article v-for="item in drafts" :key="item.id" class="p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <Badge tone="muted">{{ item.status }}</Badge>
                <Badge tone="muted">{{ item.draftType }}</Badge>
              </div>
              <span class="text-xs text-muted-foreground">{{ formatDateTime(item.createdAt) }}</span>
            </div>
            <div class="mt-2 text-sm font-medium">{{ item.subject || '(no subject)' }}</div>
            <div class="mt-1 text-xs text-muted-foreground">
              {{ item.inquiryCase?.customer?.email || item.inquiryCase?.subject || '-' }}
            </div>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {{ truncate(item.bodyText, 520) }}
            </p>
          </article>
          <EmptyState v-if="!loading && drafts.length === 0">暂无回复草稿</EmptyState>
        </div>
      </Card>
    </div>
  </section>
</template>
