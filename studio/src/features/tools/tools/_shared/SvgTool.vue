<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconEraser, IconFileCode } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { formatSvg, minifySvg, sanitizeSvg } from './svg-tools';

type SvgMode = 'viewer' | 'formatter' | 'minifier';

const props = defineProps<{ mode: SvgMode }>();
const example =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" rx="18" fill="#edf6df"/><circle cx="60" cy="60" r="28" fill="#5a9600"/><text x="105" y="68" font-size="20" fill="#161a1d">Studio Tools</text></svg>';
const input = ref('');
const output = ref('');
const previewUrl = ref('');
const error = ref('');

const actionLabel = computed(() =>
  props.mode === 'viewer' ? '安全预览' : props.mode === 'formatter' ? '格式化 SVG' : '压缩 SVG',
);

function releasePreview(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

async function process(): Promise<void> {
  error.value = '';
  releasePreview();
  try {
    output.value =
      props.mode === 'viewer'
        ? await sanitizeSvg(input.value)
        : props.mode === 'formatter'
          ? await formatSvg(input.value)
          : await minifySvg(input.value);
    previewUrl.value = URL.createObjectURL(new Blob([output.value], { type: 'image/svg+xml' }));
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : 'SVG 处理失败。';
  }
}

function clear(): void {
  input.value = '';
  output.value = '';
  error.value = '';
  releasePreview();
}

onBeforeUnmount(releasePreview);
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="SVG 源码" description="远程引用、脚本和事件属性会在预览前移除。">
      <div class="tool-stack">
        <ToolInput
          v-model="input"
          label="SVG XML"
          placeholder='<svg xmlns="http://www.w3.org/2000/svg">...</svg>'
        />
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="process">
            <IconFileCode :size="16" aria-hidden="true" />{{ actionLabel }}
          </button>
          <button type="button" class="tool-button tool-button--quiet" @click="input = example">
            使用示例
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <div class="tool-stack">
      <ToolSection title="安全预览" description="预览使用清理后的本地 Blob。">
        <div v-if="previewUrl" class="tool-image-preview tool-image-preview--checker">
          <img :src="previewUrl" alt="SVG 预览" />
        </div>
        <div v-else class="tool-image-preview tool-image-preview--empty">SVG 预览将在这里显示</div>
      </ToolSection>
      <ToolOutput
        title="SVG 结果"
        :value="output"
        filename="result.svg"
        mime-type="image/svg+xml;charset=utf-8"
        :rows="8"
      />
    </div>
  </div>
  <ToolHelp
    :steps="['输入 SVG 源码。', `点击${actionLabel}。`, '核对安全预览并复制或下载结果。']"
  />
</template>
