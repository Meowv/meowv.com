<script setup lang="ts">
import { ref } from 'vue';
import { IconRefresh } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { guidV4, uuidV1, uuidV7 } from './security-crypto';
const props = defineProps<{ mode: 'v1' | 'v7' | 'guid' }>();
const count = ref(5);
const output = ref('');
function generate(): void {
  const size = Math.max(1, Math.min(100, Math.trunc(count.value)));
  const create = props.mode === 'v1' ? uuidV1 : props.mode === 'v7' ? uuidV7 : guidV4;
  output.value = Array.from({ length: size }, create).join('\n');
}
</script>
<template>
  <div class="tool-workspace-grid">
    <ToolSection
      :title="mode === 'v1' ? 'UUID v1' : mode === 'v7' ? 'UUID v7' : 'GUID v4'"
      :description="
        mode === 'v1'
          ? '基于当前时间与随机节点生成。'
          : mode === 'v7'
            ? '生成按时间大致有序的 UUID。'
            : '使用系统密码学随机源生成 GUID。'
      "
      ><div class="tool-stack">
        <label class="tool-field"
          ><span>生成数量</span
          ><input v-model.number="count" type="number" min="1" max="100" /></label
        ><ToolActions
          ><button type="button" class="tool-button tool-button--primary" @click="generate">
            <IconRefresh :size="16" aria-hidden="true" />生成
          </button></ToolActions
        >
      </div></ToolSection
    ><ToolOutput title="生成结果" :value="output" filename="identifiers.txt" />
  </div>
  <ToolHelp :steps="['设置生成数量。', '使用浏览器安全随机源生成。', '复制或下载结果。']" />
</template>
