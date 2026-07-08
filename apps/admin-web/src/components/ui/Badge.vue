<script setup lang="ts">
import { computed } from 'vue';

import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
  class?: string;
}>(), {
  tone: 'default',
  class: '',
});

const classes = computed(() => cn(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
  props.tone === 'default' && 'border-transparent bg-primary text-primary-foreground',
  props.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
  props.tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700',
  props.tone === 'danger' && 'border-red-200 bg-red-50 text-red-700',
  props.tone === 'muted' && 'border-border bg-muted text-muted-foreground',
  props.class,
));
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
