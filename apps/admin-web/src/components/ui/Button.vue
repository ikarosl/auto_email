<script setup lang="ts">
import { computed } from 'vue';

import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'icon';
  disabled?: boolean;
  class?: string;
}>(), {
  variant: 'default',
  size: 'default',
  disabled: false,
  class: '',
});

const classes = computed(() => cn(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  props.variant === 'default' && 'bg-primary text-primary-foreground hover:bg-primary/90',
  props.variant === 'secondary' && 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  props.variant === 'outline' && 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  props.variant === 'ghost' && 'hover:bg-accent hover:text-accent-foreground',
  props.size === 'default' && 'h-9 px-4 py-2',
  props.size === 'sm' && 'h-8 px-3 text-xs',
  props.size === 'icon' && 'h-9 w-9',
  props.class,
));
</script>

<template>
  <button :class="classes" :disabled="disabled">
    <slot />
  </button>
</template>
