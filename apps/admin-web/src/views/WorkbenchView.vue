<script setup lang="ts">
import { Activity, Database, Inbox, RefreshCcw, ShieldAlert } from 'lucide-vue-next';
import { computed, onMounted } from 'vue';

import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Progress from '@/components/ui/Progress.vue';
import StatusPill from '@/components/workbench/StatusPill.vue';
import { useWorkbenchStore } from '@/stores/workbench.store';

const store = useWorkbenchStore();

const sortedInquiries = computed(() =>
  [...store.inquiries].sort(
    (a, b) => new Date(b.latestMessageAt).getTime() - new Date(a.latestMessageAt).getTime(),
  ),
);

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

onMounted(() => {
  void store.refresh();
});
</script>

<template>
  <main class="min-h-screen bg-background text-foreground">
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-5">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 class="text-xl font-semibold tracking-normal">邮件询盘工作台</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            后端状态、询盘队列和 AI 判定链路的临时操作台
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Badge :tone="store.health?.status === 'ok' ? 'success' : 'warning'">
            {{ store.health?.database ?? 'unknown' }}
          </Badge>
          <Button variant="outline" :disabled="store.loading" @click="store.refresh">
            <RefreshCcw class="h-4 w-4" :class="{ 'animate-spin': store.loading }" />
            刷新
          </Button>
        </div>
      </header>

      <section v-if="store.loading || store.loadingStep" class="space-y-2">
        <div class="flex items-center justify-between text-sm text-muted-foreground">
          <span>{{ store.loadingStep || '完成' }}</span>
          <span>{{ store.loadProgress }}%</span>
        </div>
        <Progress :value="store.loadProgress" />
      </section>

      <Card v-if="store.error" class="border-red-200 bg-red-50 p-4 text-red-700">
        {{ store.error }}
      </Card>

      <section class="grid gap-3 md:grid-cols-4">
        <Card class="p-4">
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted-foreground">服务状态</span>
            <Activity class="h-4 w-4 text-muted-foreground" />
          </div>
          <div class="mt-3 text-2xl font-semibold">{{ store.health?.status ?? 'unknown' }}</div>
        </Card>
        <Card class="p-4">
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted-foreground">数据库</span>
            <Database class="h-4 w-4 text-muted-foreground" />
          </div>
          <div class="mt-3 text-2xl font-semibold">{{ store.health?.database ?? 'unknown' }}</div>
        </Card>
        <Card class="p-4">
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted-foreground">询盘总数</span>
            <Inbox class="h-4 w-4 text-muted-foreground" />
          </div>
          <div class="mt-3 text-2xl font-semibold">{{ store.totalInquiries }}</div>
        </Card>
        <Card class="p-4">
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted-foreground">无效询盘</span>
            <ShieldAlert class="h-4 w-4 text-muted-foreground" />
          </div>
          <div class="mt-3 text-2xl font-semibold">{{ store.invalidInquiries }}</div>
        </Card>
      </section>

      <Card class="overflow-hidden">
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 class="text-base font-semibold">询盘列表</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ store.lastLoadedAt ? `最后刷新 ${store.lastLoadedAt.toLocaleTimeString()}` : '等待加载' }}
            </p>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px] text-left text-sm">
            <thead class="border-b border-border bg-muted/60 text-muted-foreground">
              <tr>
                <th class="px-4 py-3 font-medium">客户</th>
                <th class="px-4 py-3 font-medium">主题</th>
                <th class="px-4 py-3 font-medium">状态</th>
                <th class="px-4 py-3 font-medium">最新邮件</th>
                <th class="px-4 py-3 font-medium">ID</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in sortedInquiries"
                :key="item.id"
                class="border-b border-border last:border-0 hover:bg-muted/40"
              >
                <td class="px-4 py-3">
                  <div class="font-medium">{{ item.customerName || item.customerEmail }}</div>
                  <div class="text-xs text-muted-foreground">{{ item.customerEmail }}</div>
                </td>
                <td class="max-w-[320px] px-4 py-3">
                  <div class="truncate">{{ item.subject || '(no subject)' }}</div>
                </td>
                <td class="px-4 py-3">
                  <StatusPill :status="item.status" />
                </td>
                <td class="px-4 py-3 text-muted-foreground">
                  {{ formatDate(item.latestMessageAt) }}
                </td>
                <td class="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {{ item.id }}
                </td>
              </tr>
              <tr v-if="!store.loading && sortedInquiries.length === 0">
                <td class="px-4 py-8 text-center text-muted-foreground" colspan="5">
                  暂无询盘数据
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  </main>
</template>
