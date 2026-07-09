<script setup lang="ts">
import {
  Bot,
  FileText,
  Inbox,
  LayoutDashboard,
  RefreshCcw,
  Route,
  Users,
} from 'lucide-vue-next';
import { WEB_ROUTES } from '@email-inquiry/shared';
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import { cn } from '@/lib/utils';
import { useWorkbenchStore } from '@/stores/workbench.store';

const route = useRoute();
const store = useWorkbenchStore();

const navItems = [
  { label: '工作台概览', path: WEB_ROUTES.workbench, icon: LayoutDashboard },
  { label: '邮件线程', path: WEB_ROUTES.threads, icon: Inbox },
  { label: '询盘机会', path: WEB_ROUTES.inquiries, icon: Route },
  { label: '客户管理', path: WEB_ROUTES.customers, icon: Users },
  { label: '上下文快照', path: WEB_ROUTES.contexts, icon: FileText },
  { label: 'AI 记录', path: WEB_ROUTES.ai, icon: Bot },
];

const pageTitle = computed(() => navItems.find((item) => route.path.startsWith(item.path) && item.path !== '/')?.label
  ?? (route.path === '/' ? '工作台概览' : '工作台'));
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <aside class="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-card lg:block">
      <div class="border-b border-border px-5 py-5">
        <div class="text-lg font-semibold">邮件询盘工作台</div>
        <div class="mt-1 text-xs text-muted-foreground">AI email inquiry console</div>
      </div>

      <nav class="space-y-1 p-3">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            route.path === item.path || (item.path !== '/' && route.path.startsWith(item.path))
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )"
        >
          <component :is="item.icon" class="h-4 w-4" />
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <div class="lg:pl-64">
      <!-- <header class="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div class="flex min-h-16 flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <div class="text-lg font-semibold">{{ pageTitle }}</div>
            <div class="text-xs text-muted-foreground">只读工作台，优先看清邮件、客户、上下文和 AI 判断链路</div>
          </div>
          <div class="flex items-center gap-2">
            <Badge :tone="store.health?.database === 'connected' ? 'success' : 'warning'">
              DB {{ store.health?.database ?? 'unknown' }}
            </Badge>
            <Button variant="outline" size="sm" :disabled="store.loading" @click="store.refresh">
              <RefreshCcw class="h-4 w-4" :class="{ 'animate-spin': store.loading }" />
              刷新概览
            </Button>
          </div>
        </div>
      </header> -->

      <main class="px-5 py-5">
        <RouterView />
      </main>
    </div>
  </div>
</template>
