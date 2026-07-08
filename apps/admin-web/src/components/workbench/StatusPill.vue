<script setup lang="ts">
import { computed } from 'vue';

import Badge from '@/components/ui/Badge.vue';

const props = defineProps<{ status: string }>();

type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'muted';

const tone = computed<BadgeTone>(() => {
  if (props.status === 'invalid' || props.status === 'closed') return 'danger';
  if (props.status === 'ready_for_quote' || props.status === 'need_engineer_review') return 'warning';
  if (props.status === 'quoted') return 'success';
  return 'muted';
});
</script>

<template>
  <Badge :tone="tone">
    {{ status }}
  </Badge>
</template>
