<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconFingerprint, IconRefresh } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { generateUuidV4 } from './uuid-utils';

const count = ref(5);
const uppercase = ref(false);
const values = ref<string[]>([]);
const output = computed(() => {
  const content = values.value.join('\n');
  return uppercase.value ? content.toUpperCase() : content;
});

function generate(): void {
  values.value = generateUuidV4(count.value);
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="生成参数" description="使用浏览器密码学随机源生成 RFC 4122 UUID v4。">
      <div class="tool-stack">
        <div class="tool-inline-fields">
          <label class="tool-field">
            <span>生成数量</span>
            <input v-model.number="count" type="number" min="1" max="100" inputmode="numeric" />
          </label>
          <label class="tool-check">
            <input v-model="uppercase" type="checkbox" />
            <span>使用大写字母</span>
          </label>
        </div>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="generate">
            <IconFingerprint :size="16" aria-hidden="true" />
            生成 UUID
          </button>
          <button
            type="button"
            class="tool-button tool-button--secondary"
            :disabled="!values.length"
            @click="generate"
          >
            <IconRefresh :size="16" aria-hidden="true" />
            重新生成
          </button>
        </ToolActions>
        <p class="tool-status">单次最多生成 100 个 UUID，所有结果仅保留在当前页面。</p>
      </div>
    </ToolSection>
    <ToolOutput title="UUID v4 结果" :value="output" filename="uuid-v4.txt" />
  </div>
  <ToolHelp :steps="['设置生成数量。', '按需选择大写格式。', '生成后复制或下载 UUID 列表。']" />
</template>
