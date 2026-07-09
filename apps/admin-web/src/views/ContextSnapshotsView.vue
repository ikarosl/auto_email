<script setup lang="ts">
import type { ContextSnapshotListItem } from '@email-inquiry/shared';
import { RefreshCcw } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

import { fetchContextSnapshot, fetchContextSnapshots } from '@/api/backend';
import Badge from '@/components/ui/Badge.vue';
import Card from '@/components/ui/Card.vue';
import EmptyState from '@/components/workbench/EmptyState.vue';
import JsonBlock from '@/components/workbench/JsonBlock.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import { formatDateTime } from '@/lib/format';

const loading = ref(false);
const error = ref('');
const items = ref<ContextSnapshotListItem[]>([]);
const selectedId = ref('');
const detail = ref<any>(null);
const detailLoading = ref(false);
const activeTab = ref<'payload' | 'messages' | 'output' | 'sources' | 'email'>('payload');
const total = ref(0);

const selected = computed(() => items.value.find((item) => item.id === selectedId.value));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchContextSnapshots({ page: 1, limit: 30 });
    items.value = result.data;
    total.value = result.total;
    selectedId.value = selectedId.value || items.value[0]?.id || '';
    if (selectedId.value) loadDetail(selectedId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function loadDetail(id: string) {
  detailLoading.value = true;
  try {
    detail.value = await fetchContextSnapshot(id);
  } catch {
    detail.value = null;
  } finally {
    detailLoading.value = false;
  }
}

function onSelect(id: string) {
  selectedId.value = id;
  loadDetail(id);
}

onMounted(load);
</script>

<template>
  <section>
    <PageHeader
      title="上下文快照"
      description="查看每次发送给 AI 的结构化 contextPayload 和最终 Chat API messages。"
      :loading="loading"
      @refresh="load"
    >
      <template #action>
        <RefreshCcw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
        刷新
      </template>
    </PageHeader>

    <Card v-if="error" class="mb-4 border-red-200 bg-red-50 p-4 text-red-700">{{ error }}</Card>

    <div class="grid gap-4 xl:grid-cols-[380px_1fr]">
      <!-- Sidebar: snapshot list -->
      <Card class="overflow-hidden">
        <div class="border-b border-border px-4 py-3 text-sm text-muted-foreground">共 {{ total }} 个快照</div>
        <button
          v-for="item in items"
          :key="item.id"
          class="block w-full border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50"
          :class="{ 'bg-muted': selectedId === item.id }"
          @click="onSelect(item.id)"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="truncate font-medium">{{ item.inquiryCase?.subject || item.purpose }}</div>
            <Badge tone="muted">{{ item.estimatedTokens ?? '-' }} tok</Badge>
          </div>
          <div class="mt-1 flex items-center gap-2 text-xs">
            <Badge tone="default" size="sm">{{ item.purpose }}</Badge>
            <span class="text-muted-foreground">{{ formatDateTime(item.createdAt) }}</span>
          </div>
        </button>
        <EmptyState v-if="!loading && items.length === 0">暂无上下文快照</EmptyState>
      </Card>

      <!-- Detail Panel -->
      <div v-if="detailLoading" class="flex items-center justify-center py-12 text-muted-foreground">
        加载中...
      </div>
      <div v-else-if="detail" class="space-y-4">
        <!-- Inquiry & Email info -->
        <Card class="flex items-center gap-3 p-3 text-sm">
          <Badge v-if="detail.inquiryCase" tone="default">
            {{ detail.inquiryCase.status }}
          </Badge>
          <span class="font-medium">{{ detail.inquiryCase?.subject || '-' }}</span>
          <span v-if="detail.emailMessage" class="text-muted-foreground">
            / {{ detail.emailMessage.fromEmail }} — {{ detail.emailMessage.subject }}
          </span>
        </Card>

        <!-- Tabs -->
        <div class="flex gap-2 border-b">
          <button class="px-3 py-2 text-sm font-medium" :class="activeTab === 'payload' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'" @click="activeTab = 'payload'">结构化上下文</button>
          <button class="px-3 py-2 text-sm font-medium" :class="activeTab === 'messages' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'" @click="activeTab = 'messages'">Chat Messages</button>
          <button class="px-3 py-2 text-sm font-medium" :class="activeTab === 'email' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'" @click="activeTab = 'email'">当前邮件</button>
          <button class="px-3 py-2 text-sm font-medium" :class="activeTab === 'sources' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'" @click="activeTab = 'sources'">Source References</button>
        </div>

        <!-- Tab: Payload -->
        <Card v-if="activeTab === 'payload'" class="p-4">
          <div class="space-y-4">
            <div v-if="detail.contextPayload?.inquiryState">
              <h3 class="font-semibold">inquiryState</h3>
              <div class="mt-1 grid grid-cols-2 gap-2 text-sm">
                <div>状态: <StatusPill :status="detail.contextPayload.inquiryState.status" /></div>
                <div>客户: {{ detail.contextPayload.inquiryState.customerEmail }}</div>
                <div>主题: {{ detail.contextPayload.inquiryState.subject }}</div>
              </div>
            </div>
            <div v-if="detail.contextPayload?.threadSummary">
              <h3 class="font-semibold">threadSummary</h3>
              <div class="mt-1 text-sm"><JsonBlock :value="detail.contextPayload.threadSummary" /></div>
            </div>
            <div v-if="detail.contextPayload?.ragReferences?.length">
              <h3 class="font-semibold">ragReferences ({{ detail.contextPayload.ragReferences.length }})</h3>
              <div class="mt-1"><JsonBlock :value="detail.contextPayload.ragReferences" /></div>
            </div>
            <div v-if="detail.contextPayload?.currentEmail">
              <h3 class="font-semibold">currentEmail</h3>
              <div class="mt-1 rounded border bg-yellow-50 p-2 text-sm">
                <div class="font-medium">{{ detail.contextPayload.currentEmail.from }}</div>
                <div class="mt-1 whitespace-pre-wrap">{{ detail.contextPayload.currentEmail.cleanBody?.slice(0, 500) }}</div>
              </div>
            </div>
            <div v-if="detail.contextPayload?.recentThreadMessages?.length">
              <h3 class="font-semibold">recentThreadMessages ({{ detail.contextPayload.recentThreadMessages.length }})</h3>
              <div class="mt-1 max-h-60 overflow-y-auto"><JsonBlock :value="detail.contextPayload.recentThreadMessages" /></div>
            </div>
          </div>
        </Card>

        <!-- Tab: Messages -->
        <Card v-if="activeTab === 'messages'" class="p-4">
          <div class="space-y-3">
            <div v-for="(msg, i) in detail.messages" :key="i" class="rounded border p-3">
              <div class="mb-1 text-xs font-medium text-muted-foreground">
                {{ msg.role === 'system' ? 'System Prompt' : msg.role === 'user' ? 'User (Payload)' : 'Assistant' }}
              </div>
              <div class="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm">
                {{ msg.role === 'assistant' ? msg.content : msg.content?.slice(0, 2000) }}{{ msg.content?.length > 2000 ? '...' : '' }}
              </div>
            </div>
          </div>
        </Card>

        <!-- Tab: Current Email -->
        <Card v-if="activeTab === 'email'" class="p-4">
          <div class="space-y-3">
            <div>
              <h3 class="font-semibold">邮件详情</h3>
              <div class="mt-1 grid grid-cols-2 gap-2 text-sm">
                <div>发件人: {{ detail.emailMessage?.fromEmail || '-' }}</div>
                <div>主题: {{ detail.emailMessage?.subject || '-' }}</div>
                <div>时间: {{ formatDateTime(detail.emailMessage?.receivedAt) }}</div>
              </div>
            </div>
            <div v-if="detail.emailMessage">
              <h3 class="font-semibold">正文</h3>
              <div class="mt-1 whitespace-pre-wrap rounded border bg-muted/30 p-2 text-sm">
                {{ detail.emailMessage.bodyText || '(无正文)' }}
              </div>
            </div>
            <div v-if="detail.emailMessage?.aiDecisions?.length">
              <h3 class="font-semibold">AI 决策</h3>
              <div class="mt-1"><JsonBlock :value="detail.emailMessage.aiDecisions" /></div>
            </div>
          </div>
        </Card>

        <!-- Tab: Sources -->
        <Card v-if="activeTab === 'sources'" class="p-4">
          <JsonBlock :value="detail.sources || []" />
        </Card>
      </div>
      <div v-else-if="!loading" class="flex items-center justify-center py-12 text-muted-foreground">
        选择一个快照查看详情
      </div>
    </div>
  </section>
</template>
