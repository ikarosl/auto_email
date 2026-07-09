<script setup lang="ts">
import type { EmailMessageListItem, EmailThreadListItem } from '@email-inquiry/shared';
import { MailOpen, RefreshCcw } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

import { fetchEmailThreadMessages, fetchEmailThreads } from '@/api/backend';
import Badge from '@/components/ui/Badge.vue';
import Card from '@/components/ui/Card.vue';
import EmptyState from '@/components/workbench/EmptyState.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import { formatDateTime, truncate } from '@/lib/format';

const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const threads = ref<EmailThreadListItem[]>([]);
const messages = ref<EmailMessageListItem[]>([]);
const selectedThreadId = ref('');
const total = ref(0);
const messageTotal = ref(0);
const threadPage = ref(1);
const threadLimit = 30;
const messagePage = ref(1);
const messageLimit = 50;
const messageLoading = ref(false);
const messageLoadingMore = ref(false);

const selectedThread = computed(() => threads.value.find((item) => item.id === selectedThreadId.value));
const hasMoreThreads = computed(() => threads.value.length < total.value);
const hasMoreMessages = computed(() => messages.value.length < messageTotal.value);

async function loadThreads(reset = true) {
  if (reset) {
    loading.value = true;
    threadPage.value = 1;
  } else {
    loadingMore.value = true;
  }
  error.value = '';
  try {
    const result = await fetchEmailThreads({ page: threadPage.value, limit: threadLimit });
    threads.value = reset ? result.data : mergeThreads(threads.value, result.data);
    total.value = result.total;

    const selectedStillExists = threads.value.some((item) => item.id === selectedThreadId.value);
    if ((!selectedThreadId.value || !selectedStillExists) && threads.value[0]) {
      await selectThread(threads.value[0].id);
    }
  } catch (err) {
    if (!reset) threadPage.value -= 1;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadNextThreads() {
  if (loading.value || loadingMore.value || !hasMoreThreads.value) return;
  threadPage.value += 1;
  await loadThreads(false);
}

function handleThreadListScroll(event: Event) {
  const target = event.currentTarget as HTMLElement;
  const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (distanceToBottom <= 120) {
    void loadNextThreads();
  }
}

async function selectThread(threadId: string) {
  selectedThreadId.value = threadId;
  messagePage.value = 1;
  await loadThreadMessages(true);
}

async function loadThreadMessages(reset = true) {
  if (!selectedThreadId.value) return;
  if (reset) {
    messageLoading.value = true;
  } else {
    messageLoadingMore.value = true;
  }
  try {
    const result = await fetchEmailThreadMessages(selectedThreadId.value, {
      page: messagePage.value,
      limit: messageLimit,
    });
    messages.value = reset ? result.data : mergeMessages(messages.value, result.data);
    messageTotal.value = result.total;
  } catch (err) {
    if (!reset) messagePage.value -= 1;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    messageLoading.value = false;
    messageLoadingMore.value = false;
  }
}

async function loadNextMessages() {
  if (messageLoading.value || messageLoadingMore.value || !hasMoreMessages.value) return;
  messagePage.value += 1;
  await loadThreadMessages(false);
}

function handleMessageListScroll(event: Event) {
  const target = event.currentTarget as HTMLElement;
  const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (distanceToBottom <= 120) {
    void loadNextMessages();
  }
}

function mergeThreads(current: EmailThreadListItem[], incoming: EmailThreadListItem[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

function mergeMessages(current: EmailMessageListItem[], incoming: EmailMessageListItem[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

onMounted(loadThreads);
</script>

<template>
  <section>
    <PageHeader
      title="邮件线程"
      description="按线程查看客户与我方的邮件往来，当前页面只读展示归并结果。"
      :loading="loading"
      @refresh="loadThreads"
    >
      <template #action>
        <RefreshCcw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
        刷新
      </template>
    </PageHeader>

    <Card v-if="error" class="mb-4 border-red-200 bg-red-50 p-4 text-red-700">{{ error }}</Card>

    <div class="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card class="overflow-hidden">
        <div class="border-b border-border px-4 py-3">
          <div class="font-semibold">线程列表</div>
          <div class="text-sm text-muted-foreground">共 {{ total }} 条</div>
        </div>
        <div class="max-h-[720px] overflow-auto" @scroll.passive="handleThreadListScroll">
          <button
            v-for="thread in threads"
            :key="thread.id"
            class="block w-full border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50"
            :class="{ 'bg-muted': selectedThreadId === thread.id }"
            @click="selectThread(thread.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate font-medium">{{ thread.subjectNormalized || '(no subject)' }}</div>
                <div class="mt-1 truncate text-xs text-muted-foreground">{{ thread.customerEmail || '-' }}</div>
              </div>
              <Badge tone="muted">{{ thread.counts?.emailMessages ?? 0 }}</Badge>
            </div>
            <div class="mt-2 text-xs text-muted-foreground">{{ formatDateTime(thread.latestMessageAt) }}</div>
          </button>
          <EmptyState v-if="!loading && threads.length === 0">暂无邮件线程</EmptyState>
          <div v-if="loadingMore" class="px-4 py-3 text-center text-xs text-muted-foreground">
            正在加载更多线程...
          </div>
          <div
            v-else-if="threads.length > 0 && !hasMoreThreads"
            class="px-4 py-3 text-center text-xs text-muted-foreground"
          >
            已加载全部线程
          </div>
        </div>
      </Card>

      <Card class="overflow-hidden">
        <div class="border-b border-border px-4 py-3">
          <div class="flex items-center gap-2 font-semibold">
            <MailOpen class="h-4 w-4" />
            {{ selectedThread?.subjectNormalized || '线程详情' }}
          </div>
          <div class="mt-1 text-sm text-muted-foreground">{{ selectedThread?.customerEmail || '请选择线程' }}</div>
        </div>

        <div class="max-h-[720px] space-y-3 overflow-y-auto p-4" @scroll.passive="handleMessageListScroll">
          <article
            v-for="message in messages"
            :key="message.id"
            class="rounded-md border border-border p-4"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <Badge :tone="message.direction === 'inbound' ? 'default' : 'success'">
                  {{ message.direction }}
                </Badge>
                <span class="font-medium">{{ message.fromName || message.fromEmail }}</span>
              </div>
              <span class="text-xs text-muted-foreground">{{ formatDateTime(message.receivedAt) }}</span>
            </div>
            <div class="mt-2 text-sm font-medium">{{ message.subject || '(no subject)' }}</div>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {{ truncate(message.bodyText, 600) }}
            </p>
            <div v-if="message.latestAiDecision" class="mt-3 text-xs text-muted-foreground">
              AI: {{ message.latestAiDecision.classification }} → {{ message.latestAiDecision.suggestedStatus }}
            </div>
          </article>
          <EmptyState v-if="selectedThreadId && !messageLoading && messages.length === 0">该线程暂无邮件</EmptyState>
          <EmptyState v-if="!selectedThreadId">请选择左侧线程</EmptyState>
          <div v-if="messageLoadingMore" class="py-3 text-center text-xs text-muted-foreground">
            正在加载更多邮件...
          </div>
          <div
            v-else-if="messages.length > 0 && !hasMoreMessages"
            class="py-3 text-center text-xs text-muted-foreground"
          >
            已加载全部邮件
          </div>
        </div>
      </Card>
    </div>
  </section>
</template>
