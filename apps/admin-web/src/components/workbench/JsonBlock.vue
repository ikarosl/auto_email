<script setup lang="ts">
import { computed } from 'vue';

import { jsonPreview } from '@/lib/format';

const props = defineProps<{
  value: unknown;
}>();

const content = computed(() => jsonPreview(props.value));
</script>

<template>
  <pre class="max-h-[520px] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-5 text-foreground">{{ content }}</pre>
</template>
