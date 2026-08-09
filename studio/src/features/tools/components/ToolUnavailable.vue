<script setup lang="ts">
import { IconTools } from '@tabler/icons-vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
</script>

<template>
  <ToolSection
    title="功能准备中"
    description="这个入口已经配置完成，具体处理能力会按开发计划逐步开放。"
  >
    <div class="tool-unavailable">
      <IconTools :size="30" aria-hidden="true" />
      <div>
        <strong>当前工具暂未开放</strong>
        <p>返回同一分类可继续查看其他工具。</p>
      </div>
    </div>
  </ToolSection>
</template>
