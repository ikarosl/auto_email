<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ value?: number }>(), {
  value: 0,
});

const safeValue = computed(() => Math.min(100, Math.max(0, props.value)));
</script>

<template>
  <div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
    <div
      class="h-full bg-primary transition-all duration-300"
      :style="{ width: `${safeValue}%` }"
    />
  </div>
</template>
