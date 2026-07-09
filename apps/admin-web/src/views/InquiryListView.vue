<script setup lang="ts">
import { WEB_ROUTES, type InquiryListItem, type InquiryStatus } from '@email-inquiry/shared';
import { RefreshCcw, Search, X } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { fetchInquiries } from '@/api/backend';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import EmptyState from '@/components/workbench/EmptyState.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import PaginationBar from '@/components/workbench/PaginationBar.vue';
import StatusPill from '@/components/workbench/StatusPill.vue';
import { formatDateTime } from '@/lib/format';

const loading = ref(false);
const error = ref('');
const items = ref<InquiryListItem[]>([]);
const total = ref(0);
const page = ref(1);
const limit = 20;
const selectedStatus = ref<InquiryStatus | 'all'>('all');
const searchInput = ref('');
const searchQuery = ref('');

const statusFilters: Array<{ label: string; value: InquiryStatus | 'all' }> = [
  { label: '全部', value: 'all' },
  { label: '新询盘', value: 'new' },
  { label: '待澄清', value: 'need_clarification' },
  { label: '工程审核', value: 'need_engineer_review' },
  { label: '可报价', value: 'ready_for_quote' },
  { label: '已报价', value: 'quoted' },
  { label: '已关闭', value: 'closed' },
  { label: '无效', value: 'invalid' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const pageStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * limit + 1));
const pageEnd = computed(() => Math.min(page.value * limit, total.value));

async function load(targetPage = page.value) {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchInquiries({
      page: targetPage,
      limit,
      status: selectedStatus.value === 'all' ? undefined : selectedStatus.value,
      q: searchQuery.value || undefined,
    });
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

function selectStatus(status: InquiryStatus | 'all') {
  if (selectedStatus.value === status && page.value === 1) return;
  selectedStatus.value = status;
  void load(1);
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
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="filter in statusFilters"
            :key="filter.value"
            size="sm"
            :variant="selectedStatus === filter.value ? 'default' : 'outline'"
            :disabled="loading && selectedStatus === filter.value"
            @click="selectStatus(filter.value)"
          >
            {{ filter.label }}
          </Button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[980px] text-left text-sm">
          <thead class="border-b border-border bg-muted/60 text-muted-foreground">
            <tr>
              <th class="px-4 py-3 font-medium">主题</th>
              <th class="px-4 py-3 font-medium">客户</th>
              <th class="px-4 py-3 font-medium">状态</th>
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
              <td class="px-4 py-3"><StatusPill :status="String(item.status)" /></td>
              <td class="px-4 py-3 text-muted-foreground">{{ item.productType || '-' }}</td>
              <td class="px-4 py-3 text-muted-foreground">
                {{ item.counts?.inquiryMessages ?? 0 }} /
                {{ item.counts?.aiDecisions ?? 0 }} /
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
