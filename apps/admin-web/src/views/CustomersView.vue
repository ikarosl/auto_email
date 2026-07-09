<script setup lang="ts">
import type { CustomerListItem, CustomerStatus } from '@email-inquiry/shared';
import { RefreshCcw, Search, X } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

import { fetchCustomers, updateCustomer } from '@/api/backend';
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
const searchInput = ref('');
const searchQuery = ref('');
const savingCustomerId = ref('');
const customerDrafts = ref<Record<string, { status: CustomerStatus; invalidReason: string }>>({});

const statusFilters: Array<{ label: string; value: CustomerStatus | 'all' }> = [
  { label: '全部', value: 'all' },
  { label: '未知', value: 'unknown' },
  { label: '有效', value: 'active' },
  { label: '无效', value: 'invalid' },
];
const editableStatuses: CustomerStatus[] = ['unknown', 'active', 'invalid'];

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
      q: searchQuery.value || undefined,
    });
    items.value = result.data;
    total.value = result.total;
    page.value = result.page;
    syncCustomerDrafts(result.data);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function syncCustomerDrafts(customers: CustomerListItem[]) {
  customerDrafts.value = Object.fromEntries(
    customers.map((customer) => [
      customer.id,
      {
        status: normalizeCustomerStatus(customer.status),
        invalidReason: customer.invalidReason ?? '',
      },
    ]),
  );
}

function normalizeCustomerStatus(status: string): CustomerStatus {
  return editableStatuses.includes(status as CustomerStatus) ? (status as CustomerStatus) : 'unknown';
}

function hasCustomerDraftChanged(customer: CustomerListItem) {
  const draft = customerDrafts.value[customer.id];
  if (!draft) return false;

  return (
    draft.status !== normalizeCustomerStatus(customer.status) ||
    draft.invalidReason.trim() !== (customer.invalidReason ?? '')
  );
}

async function saveCustomerStatus(customer: CustomerListItem) {
  const draft = customerDrafts.value[customer.id];
  if (!draft || savingCustomerId.value) return;

  savingCustomerId.value = customer.id;
  error.value = '';
  try {
    const updated = await updateCustomer(customer.id, {
      status: draft.status,
      invalidReason: draft.status === 'invalid' ? draft.invalidReason.trim() || null : null,
    });
    const index = items.value.findIndex((item) => item.id === customer.id);
    if (index >= 0) {
      items.value[index] = updated;
    }
    customerDrafts.value[customer.id] = {
      status: normalizeCustomerStatus(updated.status),
      invalidReason: updated.invalidReason ?? '',
    };
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    savingCustomerId.value = '';
  }
}

function selectStatus(status: CustomerStatus | 'all') {
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
        <div class="flex min-w-[280px] flex-1 items-center justify-end gap-2">
          <div class="relative w-full max-w-[420px]">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              v-model="searchInput"
              class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="搜索公司、域名或邮箱"
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
        <table class="w-full min-w-[1280px] text-left text-sm">
          <thead class="border-b border-border bg-muted/60 text-muted-foreground">
            <tr>
              <th class="px-4 py-3 font-medium">邮箱</th>
              <th class="px-4 py-3 font-medium">名称</th>
              <th class="px-4 py-3 font-medium">状态</th>
              <th class="px-4 py-3 font-medium">询盘数</th>
              <th class="px-4 py-3 font-medium">无效原因</th>
              <th class="px-4 py-3 font-medium">更新时间</th>
              <th class="px-4 py-3 font-medium">状态修正</th>
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
              <td class="px-4 py-3">
                <div v-if="customerDrafts[item.id]" class="flex min-w-[340px] items-center gap-2">
                  <select
                    v-model="customerDrafts[item.id].status"
                    class="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    :disabled="savingCustomerId === item.id"
                  >
                    <option value="unknown">unknown</option>
                    <option value="active">active</option>
                    <option value="invalid">invalid</option>
                  </select>
                  <input
                    v-model="customerDrafts[item.id].invalidReason"
                    class="h-8 min-w-[150px] flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    placeholder="无效原因"
                    :disabled="customerDrafts[item.id].status !== 'invalid' || savingCustomerId === item.id"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    :disabled="savingCustomerId === item.id || !hasCustomerDraftChanged(item)"
                    @click="saveCustomerStatus(item)"
                  >
                    {{ savingCustomerId === item.id ? '保存中' : '保存' }}
                  </Button>
                </div>
              </td>
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
