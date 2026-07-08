<script setup lang="ts">
import { computed } from 'vue';

import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{ class?: string }>(), {
  class: '',
});

const classes = computed(() => cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', props.class));
</script>

<template>
  <section :class="classes">
    <slot />
  </section>
</template>
