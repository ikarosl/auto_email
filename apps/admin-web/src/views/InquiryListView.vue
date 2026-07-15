<script setup lang="ts">
import { WEB_ROUTES, type InquiryListItem } from '@email-inquiry/shared';
import { RefreshCcw, Search, X } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { fetchInquiries } from '@/api/backend';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import EmptyState from '@/components/workbench/EmptyState.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import PaginationBar from '@/components/workbench/PaginationBar.vue';
import { formatDateTime } from '@/lib/format';
import {
  getStageLabel,
  getOwnerLabel,
  getLifecycleLabel,
  stageTone,
  ownerTone,
  lifecycleTone,
  type InquiryBusinessStage,
  type InquiryActionOwner,
  type InquiryLifecycleStatus,
} from '@/types/inquiry-state';

const loading = ref(false);
const error = ref('');
const items = ref<InquiryListItem[]>([]);
const total = ref(0);
const page = ref(1);
const limit = 20;
const searchInput = ref('');
const searchQuery = ref('');

// 三维过滤器
const selectedStage = ref<InquiryBusinessStage | 'all'>('all');
const selectedOwner = ref<InquiryActionOwner | 'all'>('all');
const selectedLifecycle = ref<InquiryLifecycleStatus | 'all'>('all');

const stageFilters: Array<{ label: string; value: InquiryBusinessStage | 'all' }> = [
  { label: '全部阶段', value: 'all' },
  { label: '需求接入', value: 'intake' },
  { label: '技术评审', value: 'technical_review' },
  { label: '商务阶段', value: 'commercial' },
  { label: '合同阶段', value: 'contract' },
];

const ownerFilters: Array<{ label: string; value: InquiryActionOwner | 'all' }> = [
  { label: '全部等待方', value: 'all' },
  { label: '等待我方', value: 'us' },
  { label: '等待客户', value: 'customer' },
  { label: '无需等待', value: 'none' },
];

const lifecycleFilters: Array<{ label: string; value: InquiryLifecycleStatus | 'all' }> = [
  { label: '全部周期', value: 'all' },
  { label: '进行中', value: 'active' },
  { label: '已赢单', value: 'won' },
  { label: '已丢单', value: 'lost' },
  { label: '无效', value: 'invalid' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const pageStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * limit + 1));
const pageEnd = computed(() => Math.min(page.value * limit, total.value));

// 从 inquiry 对象读取三维状态（兼容旧 status 字段过渡）
function getStage(item: InquiryListItem): string {
  return (item as any).businessStage ?? (item as any).status ?? 'intake';
}
function getOwner(item: InquiryListItem): string {
  return (item as any).actionOwner ?? 'us';
}
function getLifecycle(item: InquiryListItem): string {
  return (item as any).lifecycleStatus ?? 'active';
}

async function load(targetPage = page.value) {
  loading.value = true;
  error.value = '';
  try {
    const params: Record<string, unknown> = {
      page: targetPage,
      limit,
      q: searchQuery.value || undefined,
    };
    if (selectedStage.value !== 'all') params.businessStage = selectedStage.value;
    if (selectedOwner.value !== 'all') params.actionOwner = selectedOwner.value;
    if (selectedLifecycle.value !== 'all') params.lifecycleStatus = selectedLifecycle.value;

    const result = await fetchInquiries(params as any);
    items.value = result.data;
    total.value = result.total;
    page.value = result.page;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function goToPreviousPage() {
  if (page.value <= 1 || loading.value) return;
  void load(page.value - 1);
}

function goToNextPage() {
  if (page.value >= totalPages.value || loading.value) return;
  void load(page.value + 1);
}

function goToPage(targetPage: number) {
  if (targetPage === page.value || loading.value) return;
  void load(targetPage);
}

function applySearch() {
  const nextQuery = searchInput.value.trim();
  if (searchQuery.value === nextQuery && page.value === 1) return;
  searchQuery.value = nextQuery;
  void load(1);
}

function clearSearch() {
  if (!searchInput.value && !searchQuery.value) return;
  searchInput.value = '';
  searchQuery.value = '';
  void load(1);
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
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div class="text-sm text-muted-foreground">询盘列表</div>
        <div class="flex min-w-[280px] flex-1 items-center justify-end gap-2">
          <div class="relative w-full max-w-[420px]">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              v-model="searchInput"
              class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="搜索客户域名、邮箱或主题"
              @keyup.enter="applySearch"
            />
            <button
              v-if="searchInput || searchQuery"
              class="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded hover:bg-muted"
              type="button"
              @click="clearSearch"
            >
              <X class="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <Button size="sm" variant="outline" :disabled="loading" @click="applySearch">查询</Button>
        </div>
        <!-- 业务阶段筛选 -->
        <div class="flex flex-wrap gap-1">
          <span class="mr-1 text-xs leading-8 text-muted-foreground">阶段</span>
          <button
            v-for="f in stageFilters"
            :key="f.value"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            :class="selectedStage === f.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'"
            @click="selectedStage = f.value; load(1)"
          >{{ f.label }}</button>
        </div>
        <!-- 等待方筛选 -->
        <div class="flex flex-wrap gap-1">
          <span class="mr-1 text-xs leading-8 text-muted-foreground">等待</span>
          <button
            v-for="f in ownerFilters"
            :key="f.value"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            :class="selectedOwner === f.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'"
            @click="selectedOwner = f.value; load(1)"
          >{{ f.label }}</button>
        </div>
        <!-- 生命周期筛选 -->
        <div class="flex flex-wrap gap-1">
          <span class="mr-1 text-xs leading-8 text-muted-foreground">周期</span>
          <button
            v-for="f in lifecycleFilters"
            :key="f.value"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            :class="selectedLifecycle === f.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'"
            @click="selectedLifecycle = f.value; load(1)"
          >{{ f.label }}</button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[980px] text-left text-sm">
          <thead class="border-b border-border bg-muted/60 text-muted-foreground">
            <tr>
              <th class="px-4 py-3 font-medium">主题</th>
              <th class="px-4 py-3 font-medium">客户</th>
              <th class="px-4 py-3 font-medium">业务阶段</th>
              <th class="px-4 py-3 font-medium">等待方</th>
              <th class="px-4 py-3 font-medium">生命周期</th>
              <th class="px-4 py-3 font-medium">产品</th>
              <th class="px-4 py-3 font-medium">邮件/AI/上下文</th>
              <th class="px-4 py-3 font-medium">最新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id" class="border-b border-border last:border-0 hover:bg-muted/40">
              <td class="max-w-[320px] px-4 py-3">
                <RouterLink class="font-medium hover:underline" :to="`${WEB_ROUTES.inquiries}/${item.id}`">
                  {{ item.businessSubject || item.subject || '(no subject)' }}
                </RouterLink>
                <div
                  v-if="item.rawSubject && item.rawSubject !== item.businessSubject"
                  class="mt-1 truncate text-xs text-muted-foreground"
                >
                  原始主题：{{ item.rawSubject }}
                </div>
              </td>
              <td class="px-4 py-3">
                <div>{{ item.customer?.name || item.customer?.email || '-' }}</div>
                <div class="text-xs text-muted-foreground">{{ item.customer?.email }}</div>
              </td>
              <td class="px-4 py-3"><Badge :tone="stageTone(getStage(item))">{{ getStageLabel(getStage(item)) }}</Badge></td>
              <td class="px-4 py-3"><Badge :tone="ownerTone(getOwner(item))">{{ getOwnerLabel(getOwner(item)) }}</Badge></td>
              <td class="px-4 py-3"><Badge :tone="lifecycleTone(getLifecycle(item))">{{ getLifecycleLabel(getLifecycle(item)) }}</Badge></td>
              <td class="px-4 py-3 text-muted-foreground">{{ item.productType || '-' }}</td>
              <td class="px-4 py-3 text-muted-foreground">
                {{ item.counts?.inquiryMessages ?? 0 }} /
                {{ item.counts?.analysisDecisions ?? 0 }} /
                {{ item.counts?.contextSnapshots ?? 0 }}
              </td>
              <td class="px-4 py-3 text-muted-foreground">{{ formatDateTime(item.latestMessageAt) }}</td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-if="!loading && items.length === 0">暂无询盘</EmptyState>
      </div>
      <PaginationBar
        :total="total"
        :page="page"
        :limit="limit"
        :total-pages="totalPages"
        :page-start="pageStart"
        :page-end="pageEnd"
        :loading="loading"
        @previous="goToPreviousPage"
        @next="goToNextPage"
        @go="goToPage"
      />
    </Card>
  </section>
</template>
