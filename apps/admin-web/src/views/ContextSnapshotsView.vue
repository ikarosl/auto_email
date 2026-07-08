<script setup lang="ts">
import type { ContextSnapshotListItem } from '@email-inquiry/shared';
import { RefreshCcw } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

import { fetchContextSnapshots } from '@/api/backend';
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
      <Card class="overflow-hidden">
        <div class="border-b border-border px-4 py-3 text-sm text-muted-foreground">共 {{ total }} 个快照</div>
        <button
          v-for="item in items"
          :key="item.id"
          class="block w-full border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50"
          :class="{ 'bg-muted': selectedId === item.id }"
          @click="selectedId = item.id"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="truncate font-medium">{{ item.inquiryCase?.subject || item.purpose }}</div>
            <Badge tone="muted">{{ item.estimatedTokens ?? '-' }}</Badge>
          </div>
          <div class="mt-1 truncate text-xs text-muted-foreground">
            {{ item.emailMessage?.subject || item.emailMessageId || '-' }}
          </div>
          <div class="mt-2 text-xs text-muted-foreground">{{ formatDateTime(item.createdAt) }}</div>
        </button>
        <EmptyState v-if="!loading && items.length === 0">暂无上下文快照</EmptyState>
      </Card>

      <div class="space-y-4">
        <Card class="p-4">
          <h2 class="font-semibold">contextPayload</h2>
          <div class="mt-3">
            <JsonBlock :value="selected?.contextPayload || {}" />
          </div>
        </Card>
        <Card class="p-4">
          <h2 class="font-semibold">messages</h2>
          <div class="mt-3">
            <JsonBlock :value="selected?.messages || []" />
          </div>
        </Card>
        <Card class="p-4">
          <h2 class="font-semibold">sourceReferences</h2>
          <div class="mt-3">
            <JsonBlock :value="selected?.sourceReferences || []" />
          </div>
        </Card>
      </div>
    </div>
  </section>
</template>
