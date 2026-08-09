<script setup lang="ts">
import { computed } from 'vue';
defineOptions({ name: 'JsonTreeNode' });
const props = defineProps<{ label: string; value: unknown; depth?: number; graph?: boolean }>();
const record = computed(() =>
  typeof props.value === 'object' && props.value !== null
    ? (props.value as Record<string, unknown>)
    : null,
);
const entries = computed(() => (record.value ? Object.entries(record.value) : []));
const type = computed(() =>
  Array.isArray(props.value)
    ? 'Array'
    : record.value
      ? 'Object'
      : props.value === null
        ? 'null'
        : typeof props.value,
);
const primitive = computed(() =>
  typeof props.value === 'string' ? `"${props.value}"` : String(props.value),
);
</script>
<template>
  <details
    v-if="record"
    class="tool-json-node"
    :class="{ 'is-graph': graph }"
    :open="(depth ?? 0) < 2"
  >
    <summary>
      <strong>{{ label }}</strong
      ><span>{{ type }} · {{ entries.length }} 项</span>
    </summary>
    <div class="tool-json-node__children">
      <JsonTreeNode
        v-for="([key, child], index) in entries"
        :key="`${key}-${index}`"
        :label="key"
        :value="child"
        :depth="(depth ?? 0) + 1"
        :graph="graph"
      />
    </div>
  </details>
  <div v-else class="tool-json-leaf" :class="`is-${type}`">
    <strong>{{ label }}</strong
    ><code>{{ primitive }}</code>
  </div>
</template>
