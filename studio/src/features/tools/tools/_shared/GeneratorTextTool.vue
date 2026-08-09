<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconRefresh } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { avatarSvg, fakeUser, randomNumbers, secureString } from './generator-utils';

type Mode = 'nanoid' | 'number' | 'fake-user' | 'avatar' | 'meta' | 'html' | 'css-reset';
const props = defineProps<{ mode: Mode }>();
const length = ref(21);
const count = ref(1);
const alphabet = ref('_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
const min = ref(0);
const max = ref(100);
const decimals = ref(0);
const label = ref('MV');
const background = ref('#7C3AED');
const foreground = ref('#FFFFFF');
const siteTitle = ref('Meowv Studio');
const description = ref('专注浏览器本地处理的在线工具。');
const url = ref('https://studio.meowv.com');
const output = ref('');
const error = ref('');
const title = computed(
  () =>
    ({
      nanoid: 'Nano ID 生成器',
      number: '随机数生成器',
      'fake-user': '虚拟用户生成器',
      avatar: '头像生成器',
      meta: 'Meta Tag 生成器',
      html: 'HTML 模板生成器',
      'css-reset': 'CSS Reset 生成器',
    })[props.mode],
);
const avatarUrl = computed(() =>
  output.value.startsWith('<svg')
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(output.value)}`
    : '',
);

function generate(): void {
  error.value = '';
  try {
    if (props.mode === 'nanoid')
      output.value = Array.from({ length: Math.max(1, Math.min(100, count.value)) }, () =>
        secureString(length.value, alphabet.value),
      ).join('\n');
    else if (props.mode === 'number')
      output.value = randomNumbers(min.value, max.value, count.value, decimals.value).join('\n');
    else if (props.mode === 'fake-user') output.value = JSON.stringify(fakeUser(), null, 2);
    else if (props.mode === 'avatar')
      output.value = avatarSvg(label.value, background.value, foreground.value);
    else if (props.mode === 'meta')
      output.value = `<title>${siteTitle.value}</title>\n<meta name="description" content="${description.value}">\n<link rel="canonical" href="${url.value}">\n<meta property="og:title" content="${siteTitle.value}">\n<meta property="og:description" content="${description.value}">\n<meta property="og:url" content="${url.value}">\n<meta property="og:type" content="website">\n<meta name="twitter:card" content="summary_large_image">`;
    else if (props.mode === 'html')
      output.value = `<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${siteTitle.value}</title>\n  <meta name="description" content="${description.value}">\n</head>\n<body>\n  <main>\n    <h1>${siteTitle.value}</h1>\n  </main>\n</body>\n</html>`;
    else
      output.value = `*, *::before, *::after { box-sizing: border-box; }\n* { margin: 0; }\nhtml { color-scheme: light dark; }\nbody { min-height: 100vh; line-height: 1.5; -webkit-font-smoothing: antialiased; }\nimg, picture, video, canvas, svg { display: block; max-width: 100%; }\ninput, button, textarea, select { font: inherit; }\np, h1, h2, h3, h4, h5, h6 { overflow-wrap: break-word; }\nbutton { cursor: pointer; }`;
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '生成失败。';
  }
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="title" description="配置参数并在浏览器本地生成结果。"
      ><div class="tool-stack">
        <template v-if="mode === 'nanoid'"
          ><label class="tool-field"
            ><span>长度</span
            ><input v-model.number="length" type="number" min="1" max="256" /></label
          ><label class="tool-field"
            ><span>数量</span
            ><input v-model.number="count" type="number" min="1" max="100" /></label
          ><label class="tool-field"><span>字符集</span><input v-model="alphabet" /></label
        ></template>
        <template v-if="mode === 'number'"
          ><div class="tool-options-grid">
            <label class="tool-field"
              ><span>最小值</span><input v-model.number="min" type="number" /></label
            ><label class="tool-field"
              ><span>最大值</span><input v-model.number="max" type="number" /></label
            ><label class="tool-field"
              ><span>数量</span
              ><input v-model.number="count" type="number" min="1" max="1000" /></label
            ><label class="tool-field"
              ><span>小数位</span><input v-model.number="decimals" type="number" min="0" max="8"
            /></label></div
        ></template>
        <template v-if="mode === 'avatar'"
          ><label class="tool-field"><span>文字</span><input v-model="label" maxlength="8" /></label
          ><label class="tool-field"
            ><span>背景色</span><input v-model="background" type="color" /></label
          ><label class="tool-field"
            ><span>文字色</span><input v-model="foreground" type="color" /></label
        ></template>
        <template v-if="['meta', 'html'].includes(mode)"
          ><label class="tool-field"><span>标题</span><input v-model="siteTitle" /></label
          ><label class="tool-field"><span>描述</span><input v-model="description" /></label
          ><label v-if="mode === 'meta'" class="tool-field"
            ><span>Canonical URL</span><input v-model="url" type="url" /></label
        ></template>
        <ToolActions
          ><button type="button" class="tool-button tool-button--primary" @click="generate">
            <IconRefresh :size="16" aria-hidden="true" />生成
          </button></ToolActions
        >
        <p v-if="error" class="tool-status tool-status--error">{{ error }}</p>
        <img
          v-if="avatarUrl"
          class="tool-avatar-preview"
          :src="avatarUrl"
          alt="头像预览"
        /></div></ToolSection
    ><ToolOutput
      :title="`${title}结果`"
      :value="output"
      :filename="
        mode === 'avatar' ? 'avatar.svg' : mode === 'css-reset' ? 'reset.css' : 'generated.txt'
      "
    />
  </div>
  <ToolHelp
    :steps="['填写生成参数。', '使用浏览器安全随机源或模板生成。', '复制或下载结果。']"
    note="虚拟用户信息仅用于测试，姓名、邮箱和地址均为随机虚构。"
  />
</template>
