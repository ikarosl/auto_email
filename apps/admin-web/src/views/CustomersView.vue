<script setup lang="ts">
import type { CustomerListItem } from '@email-inquiry/shared';
import { RefreshCcw } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';

import { fetchCustomers } from '@/api/backend';
import Badge from '@/components/ui/Badge.vue';
import Card from '@/components/ui/Card.vue';
import EmptyState from '@/components/workbench/EmptyState.vue';
import PageHeader from '@/components/workbench/PageHeader.vue';
import { formatDateTime } from '@/lib/format';

const loading = ref(false);
const error = ref('');
const items = ref<CustomerListItem[]>([]);
const total = ref(0);

function customerTone(status: string) {
  if (status === 'active') return 'success';
  if (status === 'invalid') return 'danger';
  return 'muted';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchCustomers({ page: 1, limit: 80 });
    items.value = result.data;
    total.value = result.total;
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
      <div class="border-b border-border px-4 py-3 text-sm text-muted-foreground">共 {{ total }} 位客户</div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[900px] text-left text-sm">
          <thead class="border-b border-border bg-muted/60 text-muted-foreground">
            <tr>
              <th class="px-4 py-3 font-medium">邮箱</th>
              <th class="px-4 py-3 font-medium">名称/公司</th>
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
    </Card>
  </section>
</template>
