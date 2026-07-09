<script setup lang="ts">
import type { AiDecisionListItem, ReplyDraftListItem } from '@email-inquiry/shared';
import { RefreshCcw } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

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
const decisionTotal = ref(0);
const draftTotal = ref(0);
const decisionPage = ref(1);
const draftPage = ref(1);
const pageLimit = 30;
const decisionsLoadingMore = ref(false);
const draftsLoadingMore = ref(false);

const hasMoreDecisions = computed(() => decisions.value.length < decisionTotal.value);
const hasMoreDrafts = computed(() => drafts.value.length < draftTotal.value);

function confidenceText(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value * 100)}%`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [decisionResult, draftResult] = await Promise.all([
      fetchAiDecisions({ page: 1, limit: pageLimit }),
      fetchReplyDrafts({ page: 1, limit: pageLimit }),
    ]);
    decisionPage.value = 1;
    draftPage.value = 1;
    decisions.value = decisionResult.data;
    drafts.value = draftResult.data;
    decisionTotal.value = decisionResult.total;
    draftTotal.value = draftResult.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function loadNextDecisions() {
  if (loading.value || decisionsLoadingMore.value || !hasMoreDecisions.value) return;
  decisionsLoadingMore.value = true;
  error.value = '';
  try {
    decisionPage.value += 1;
    const result = await fetchAiDecisions({ page: decisionPage.value, limit: pageLimit });
    decisions.value = mergeById(decisions.value, result.data);
    decisionTotal.value = result.total;
  } catch (err) {
    decisionPage.value -= 1;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    decisionsLoadingMore.value = false;
  }
}

async function loadNextDrafts() {
  if (loading.value || draftsLoadingMore.value || !hasMoreDrafts.value) return;
  draftsLoadingMore.value = true;
  error.value = '';
  try {
    draftPage.value += 1;
    const result = await fetchReplyDrafts({ page: draftPage.value, limit: pageLimit });
    drafts.value = mergeById(drafts.value, result.data);
    draftTotal.value = result.total;
  } catch (err) {
    draftPage.value -= 1;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    draftsLoadingMore.value = false;
  }
}

function handleDecisionScroll(event: Event) {
  if (isNearBottom(event)) {
    void loadNextDecisions();
  }
}

function handleDraftScroll(event: Event) {
  if (isNearBottom(event)) {
    void loadNextDrafts();
  }
}

function isNearBottom(event: Event) {
  const target = event.currentTarget as HTMLElement;
  return target.scrollHeight - target.scrollTop - target.clientHeight <= 120;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
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
        <div class="max-h-[720px] divide-y divide-border overflow-y-auto" @scroll.passive="handleDecisionScroll">
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
          <div v-if="decisionsLoadingMore" class="px-4 py-3 text-center text-xs text-muted-foreground">
            正在加载更多 AI 决策...
          </div>
          <div
            v-else-if="decisions.length > 0 && !hasMoreDecisions"
            class="px-4 py-3 text-center text-xs text-muted-foreground"
          >
            已加载全部 AI 决策
          </div>
        </div>
      </Card>

      <Card class="overflow-hidden">
        <div class="border-b border-border px-4 py-3">
          <h2 class="font-semibold">AI 回复草稿</h2>
          <p class="mt-1 text-sm text-muted-foreground">后续用于人工审核、复制和发送。</p>
        </div>
        <div class="max-h-[720px] divide-y divide-border overflow-y-auto" @scroll.passive="handleDraftScroll">
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
          <div v-if="draftsLoadingMore" class="px-4 py-3 text-center text-xs text-muted-foreground">
            正在加载更多回复草稿...
          </div>
          <div
            v-else-if="drafts.length > 0 && !hasMoreDrafts"
            class="px-4 py-3 text-center text-xs text-muted-foreground"
          >
            已加载全部回复草稿
          </div>
        </div>
      </Card>
    </div>
  </section>
</template>
