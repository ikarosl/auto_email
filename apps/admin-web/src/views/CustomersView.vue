<script setup lang="ts">
import type { CustomerListItem, CustomerStatus } from '@email-inquiry/shared';
import { RefreshCcw } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

import { fetchCustomers } from '@/api/backend';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import EmptyState from '@/components/workbench/EmptyState.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import PaginationBar from '@/components/workbench/PaginationBar.vue';
import { formatDateTime } from '@/lib/format';

const loading = ref(false);
const error = ref('');
const items = ref<CustomerListItem[]>([]);
const total = ref(0);
const page = ref(1);
const limit = 20;
const selectedStatus = ref<CustomerStatus | 'all'>('all');

const statusFilters: Array<{ label: string; value: CustomerStatus | 'all' }> = [
  { label: '全部', value: 'all' },
  { label: '未知', value: 'unknown' },
  { label: '有效', value: 'active' },
  { label: '无效', value: 'invalid' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const pageStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * limit + 1));
const pageEnd = computed(() => Math.min(page.value * limit, total.value));

function customerTone(status: string) {
  if (status === 'active') return 'success';
  if (status === 'invalid') return 'danger';
  return 'muted';
}

async function load(targetPage = page.value) {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchCustomers({
      page: targetPage,
      limit,
      status: selectedStatus.value === 'all' ? undefined : selectedStatus.value,
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

function selectStatus(status: CustomerStatus | 'all') {
  if (selectedStatus.value === status && page.value === 1) return;
  selectedStatus.value = status;
  void load(1);
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

onMounted(load);
</script>

<template>
  <section>
    <PageHeader
      title="客户管理"
      description="查看客户状态、无效原因和询盘数量。当前阶段只读，不手动创建客户。"
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
        <div class="text-sm text-muted-foreground">客户列表</div>
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
        <table class="w-full min-w-[900px] text-left text-sm">
          <thead class="border-b border-border bg-muted/60 text-muted-foreground">
            <tr>
              <th class="px-4 py-3 font-medium">邮箱</th>
              <th class="px-4 py-3 font-medium">名称</th>
              <th class="px-4 py-3 font-medium">状态</th>
              <th class="px-4 py-3 font-medium">询盘数</th>
              <th class="px-4 py-3 font-medium">无效原因</th>
              <th class="px-4 py-3 font-medium">更新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id" class="border-b border-border last:border-0 hover:bg-muted/40">
              <td class="px-4 py-3">
                <div class="font-medium">{{ item.email }}</div>
                <div class="text-xs text-muted-foreground">{{ item.domain || '-' }}</div>
              </td>
              <td class="px-4 py-3">
                <div>{{ item.name || '-' }}</div>
                <div class="text-xs text-muted-foreground">{{ item.companyName || '-' }}</div>
              </td>
              <td class="px-4 py-3">
                <Badge :tone="customerTone(String(item.status))">{{ item.status }}</Badge>
              </td>
              <td class="px-4 py-3 text-muted-foreground">{{ item.counts?.inquiryCases ?? 0 }}</td>
              <td class="max-w-[320px] px-4 py-3 text-muted-foreground">{{ item.invalidReason || '-' }}</td>
              <td class="px-4 py-3 text-muted-foreground">{{ formatDateTime(item.updatedAt) }}</td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-if="!loading && items.length === 0">暂无客户</EmptyState>
      </div>
      <PaginationBar
        :total="total"
        :page="page"
        :limit="limit"
        :total-pages="totalPages"
        :page-start="pageStart"
        :page-end="pageEnd"
        :loading="loading"
        item-label="位客户"
        @previous="goToPreviousPage"
        @next="goToNextPage"
        @go="goToPage"
      />
    </Card>
  </section>
</template>
