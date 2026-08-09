<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { IconRefresh } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { parseUserAgent } from './developer-inspectors';
const props = defineProps<{ mode: 'browser' | 'screen' | 'device' }>();
const output = ref('');
function read(): void {
  let result: Record<string, unknown>;
  if (props.mode === 'browser')
    result = {
      ...parseUserAgent(navigator.userAgent),
      language: navigator.language,
      languages: navigator.languages,
      cookiesEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency,
    };
  else if (props.mode === 'screen')
    result = {
      screen: {
        width: screen.width,
        height: screen.height,
        availableWidth: screen.availWidth,
        availableHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
      },
      viewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio,
    };
  else
    result = {
      touchPoints: navigator.maxTouchPoints,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      platform: navigator.platform,
      pointer: matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
      hover: matchMedia('(hover: hover)').matches,
      orientation: screen.orientation
        ? { type: screen.orientation.type, angle: screen.orientation.angle }
        : null,
    };
  output.value = JSON.stringify(result, null, 2);
}
onMounted(read);
</script>
<template>
  <div class="tool-workspace-grid">
    <ToolSection
      :title="mode === 'browser' ? '浏览器信息' : mode === 'screen' ? '屏幕信息' : '设备信息'"
      description="读取当前浏览器公开的环境能力。"
      ><ToolActions
        ><button type="button" class="tool-button tool-button--primary" @click="read">
          <IconRefresh :size="16" aria-hidden="true" />刷新信息
        </button></ToolActions
      ></ToolSection
    ><ToolOutput
      title="环境信息"
      :value="output"
      filename="environment.json"
      mime-type="application/json;charset=utf-8"
    />
  </div>
  <ToolHelp
    :steps="['打开页面自动读取公开环境属性。', '改变窗口或屏幕后可刷新。', '复制诊断信息。']"
    note="结果可能用于兼容性排查；不会读取序列号、账号或文件。"
  />
</template>
