<script setup lang="ts">
import Button from '@/components/ui/Button.vue';

defineProps<{
  title: string;
  description?: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
}>();
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold">{{ title }}</h1>
      <p v-if="description" class="mt-1 text-sm text-muted-foreground">{{ description }}</p>
    </div>
    <Button variant="outline" size="sm" :disabled="loading" @click="emit('refresh')">
      <slot name="action">刷新</slot>
    </Button>
  </div>
</template>
