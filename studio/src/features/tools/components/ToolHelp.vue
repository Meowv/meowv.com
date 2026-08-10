<script setup lang="ts">
// 使用说明模块已移除，保留空组件以兼容既有工具组件调用。
withDefaults(
  defineProps<{
    title?: string;
    steps: readonly string[];
    note?: string;
  }>(),
  { title: '使用说明', note: '' },
);
</script>
