<script setup lang="ts">
import { Activity, Database, Inbox, RefreshCcw, ShieldAlert, Timer } from 'lucide-vue-next';
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { WEB_ROUTES } from '@email-inquiry/shared';

import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Progress from '@/components/ui/Progress.vue';
import EmptyState from '@/components/workbench/EmptyState.vue';
import StatusPill from '@/components/workbench/StatusPill.vue';
import { formatDateTime } from '@/lib/format';
import { useWorkbenchStore } from '@/stores/workbench.store';

const store = useWorkbenchStore();

const sortedInquiries = computed(() =>
  [...store.inquiries].sort(
    (a, b) => new Date(b.latestMessageAt ?? 0).getTime() - new Date(a.latestMessageAt ?? 0).getTime(),
  ),
);

onMounted(() => {
  if (!store.lastLoadedAt) void store.refresh();
});
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">工作台概览</h1>
        <p class="mt-1 text-sm text-muted-foreground">查看系统健康、询盘队列和近期 AI 处理结果。</p>
      </div>
      <Button variant="outline" :disabled="store.loading" @click="store.refresh">
        <RefreshCcw class="h-4 w-4" :class="{ 'animate-spin': store.loading }" />
        刷新
      </Button>
    </div>

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

    <section class="grid gap-3 md:grid-cols-5">
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
          <span class="text-sm text-muted-foreground">待处理</span>
          <Timer class="h-4 w-4 text-muted-foreground" />
        </div>
        <div class="mt-3 text-2xl font-semibold">{{ store.pendingInquiries }}</div>
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
          <h2 class="text-base font-semibold">最近询盘</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ store.lastLoadedAt ? `最后刷新 ${store.lastLoadedAt.toLocaleTimeString()}` : '等待加载' }}
          </p>
        </div>
        <RouterLink :to="WEB_ROUTES.inquiries">
          <Badge tone="muted">查看全部</Badge>
        </RouterLink>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="border-b border-border bg-muted/60 text-muted-foreground">
            <tr>
              <th class="px-4 py-3 font-medium">客户</th>
              <th class="px-4 py-3 font-medium">主题</th>
              <th class="px-4 py-3 font-medium">状态</th>
              <th class="px-4 py-3 font-medium">邮件数</th>
              <th class="px-4 py-3 font-medium">最新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in sortedInquiries"
              :key="item.id"
              class="border-b border-border last:border-0 hover:bg-muted/40"
            >
              <td class="px-4 py-3">
                <div class="font-medium">{{ item.customer?.name || item.customer?.email || '-' }}</div>
                <div class="text-xs text-muted-foreground">{{ item.customer?.email }}</div>
              </td>
              <td class="max-w-[360px] px-4 py-3">
                <RouterLink class="font-medium hover:underline" :to="`${WEB_ROUTES.inquiries}/${item.id}`">
                  {{ item.subject || '(no subject)' }}
                </RouterLink>
              </td>
              <td class="px-4 py-3">
                <StatusPill :status="String(item.status)" />
              </td>
              <td class="px-4 py-3 text-muted-foreground">{{ item.counts?.inquiryMessages ?? 0 }}</td>
              <td class="px-4 py-3 text-muted-foreground">{{ formatDateTime(item.latestMessageAt) }}</td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-if="!store.loading && sortedInquiries.length === 0">暂无询盘数据</EmptyState>
      </div>
    </Card>
  </section>
</template>
