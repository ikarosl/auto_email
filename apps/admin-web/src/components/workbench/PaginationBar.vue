<script setup lang="ts">
import { ref, watch } from 'vue';

import Button from '@/components/ui/Button.vue';

const props = defineProps<{
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  loading?: boolean;
  itemLabel?: string;
}>();

const emit = defineEmits<{
  previous: [];
  next: [];
  go: [page: number];
}>();

const pageInput = ref(String(props.page));

watch(
  () => props.page,
  (value) => {
    pageInput.value = String(value);
  },
);

function submitPage() {
  const parsed = Number.parseInt(pageInput.value, 10);
  if (Number.isNaN(parsed)) {
    pageInput.value = String(props.page);
    return;
  }

  const nextPage = Math.min(Math.max(parsed, 1), props.totalPages);
  pageInput.value = String(nextPage);
  if (nextPage !== props.page) {
    emit('go', nextPage);
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
    <span>
      共 {{ total }} {{ itemLabel || '条' }}，每页 {{ limit }} 条
    </span>
    <div class="flex flex-wrap items-center gap-3">
      <span>第 {{ page }} / {{ totalPages }} 页，当前 {{ pageStart }}-{{ pageEnd }} 条</span>
      <form class="flex items-center gap-2" @submit.prevent="submitPage">
        <Button type="button" size="sm" variant="outline" :disabled="loading || page <= 1" @click="emit('previous')">
          上一页
        </Button>
        <label class="flex items-center gap-1">
          <span>跳至</span>
          <input
            v-model="pageInput"
            class="h-8 w-16 rounded-md border border-input bg-background px-2 text-center text-sm text-foreground"
            inputmode="numeric"
            :disabled="loading"
            @blur="submitPage"
          />
          <span>页</span>
        </label>
        <Button size="sm" variant="outline" :disabled="loading" type="submit">
          跳转
        </Button>
        <Button type="button" size="sm" variant="outline" :disabled="loading || page >= totalPages" @click="emit('next')">
          下一页
        </Button>
      </form>
    </div>
  </div>
</template>
