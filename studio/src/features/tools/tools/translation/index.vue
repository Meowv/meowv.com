<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconLanguage, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-vue';
import cnchar from 'cnchar';
import order from 'cnchar-order';
import trad from 'cnchar-trad';
import { pinyin } from 'pinyin-pro';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';

const mode: 'translation' | 'convert' | 'pronunciation' | 'stroke' = 'translation';
cnchar.use(order, trad);

const input = ref('');
const output = ref('');
const error = ref('');
const processing = ref(false);
const direction = ref<'s2t' | 't2s'>('s2t');
const sourceLanguage = ref('en');
const targetLanguage = ref('zh-CN');
const rate = ref(1);
let controller: AbortController | null = null;

const title = computed(
  () =>
    ({
      translation: '在线翻译',
      convert: '简繁转换',
      pronunciation: '拼音与发音',
      stroke: '汉字笔顺',
    })[mode],
);
const description = computed(() => {
  if (mode === 'translation') return '将文本发送到 MyMemory Translation，并显示翻译结果与匹配度。';
  if (mode === 'pronunciation') return '生成带声调拼音，并使用浏览器语音朗读中文。';
  if (mode === 'stroke') return '查询常用汉字的笔画名称与书写顺序。';
  return '使用本地字库在简体中文与繁体中文之间转换。';
});

async function translate(): Promise<string> {
  if (new TextEncoder().encode(input.value).length > 500)
    throw new Error('MyMemory 单次翻译原文不能超过 500 个 UTF-8 字节。');
  controller?.abort();
  controller = new AbortController();
  const timeout = window.setTimeout(() => controller?.abort('timeout'), 15_000);
  try {
    const endpoint = new URL('/get', 'https://api.mymemory.translated.net');
    endpoint.searchParams.set('q', input.value);
    endpoint.searchParams.set('langpair', `${sourceLanguage.value}|${targetLanguage.value}`);
    const response = await fetch(endpoint, { credentials: 'omit', signal: controller.signal });
    if (!response.ok) throw new Error(`翻译服务返回 HTTP ${response.status}。`);
    const payload = (await response.json()) as {
      responseStatus?: number;
      responseDetails?: string | null;
      responseData?: { translatedText?: string; match?: number };
    };
    if (payload.responseStatus && payload.responseStatus !== 200)
      throw new Error(payload.responseDetails || `翻译服务返回状态 ${payload.responseStatus}。`);
    const translated = payload.responseData?.translatedText ?? '';
    if (!translated) throw new Error('翻译服务没有返回有效结果。');
    const match = payload.responseData?.match;
    return `源语言：${sourceLanguage.value}\n目标语言：${targetLanguage.value}${typeof match === 'number' ? `\n匹配度：${Math.round(match * 100)}%` : ''}\n\n${translated}`;
  } catch (cause) {
    if (controller?.signal.aborted) throw new Error('翻译请求已取消或超时。');
    throw cause;
  } finally {
    window.clearTimeout(timeout);
    controller = null;
  }
}

async function run(): Promise<void> {
  error.value = '';
  output.value = '';
  if (!input.value.trim()) {
    error.value = '请输入需要处理的内容。';
    return;
  }
  processing.value = true;
  try {
    if (mode === 'translation') output.value = await translate();
    else if (mode === 'convert') {
      output.value =
        direction.value === 's2t'
          ? cnchar.convert.simpleToTrad(input.value)
          : cnchar.convert.tradToSimple(input.value);
    } else if (mode === 'stroke') {
      const characters = Array.from(input.value.replace(/[^\p{Script=Han}]/gu, '')).slice(0, 20);
      if (!characters.length) throw new Error('请输入汉字。');
      const names = cnchar.stroke(characters.join(''), 'order', 'name') as string[][];
      output.value = characters
        .map(
          (character, index) =>
            `${character} · ${names[index]?.length ?? 0} 画\n${names[index]?.join(' → ') || '暂无笔顺数据'}`,
        )
        .join('\n\n');
    } else {
      const tone = pinyin(input.value, { toneType: 'symbol', type: 'array', nonZh: 'consecutive' });
      const numbered = pinyin(input.value, {
        toneType: 'num',
        type: 'array',
        nonZh: 'consecutive',
      });
      output.value = `带声调\n${tone.join(' ')}\n\n数字声调\n${numbered.join(' ')}`;
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '语言处理失败。';
  } finally {
    processing.value = false;
  }
}

function speak(): void {
  error.value = '';
  if (!input.value.trim()) {
    error.value = '请输入需要朗读的中文。';
    return;
  }
  if (!('speechSynthesis' in window)) {
    error.value = '当前浏览器不支持语音合成。';
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(input.value);
  utterance.lang = 'zh-CN';
  utterance.rate = rate.value;
  utterance.onerror = () => {
    error.value = '浏览器语音播放失败。';
  };
  speechSynthesis.speak(utterance);
}

function stop(): void {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

onBeforeUnmount(() => {
  controller?.abort();
  stop();
});
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="title" :description="description">
      <div class="tool-stack">
        <ToolInput
          v-model="input"
          label="输入内容"
          :placeholder="mode === 'stroke' ? '永字八法' : '输入要处理的文本'"
        />
        <div v-if="mode === 'translation'" class="tool-form-grid tool-form-grid--two">
          <label class="tool-field"
            ><span>源语言</span
            ><select v-model="sourceLanguage">
              <option value="zh-CN">中文</option>
              <option value="en">英语</option>
              <option value="ja">日语</option>
              <option value="ko">韩语</option>
              <option value="fr">法语</option>
              <option value="de">德语</option>
            </select></label
          >
          <label class="tool-field"
            ><span>目标语言</span
            ><select v-model="targetLanguage">
              <option value="zh-CN">中文</option>
              <option value="en">英语</option>
              <option value="ja">日语</option>
              <option value="ko">韩语</option>
              <option value="fr">法语</option>
              <option value="de">德语</option>
            </select></label
          >
        </div>
        <label v-if="mode === 'convert'" class="tool-field"
          ><span>转换方向</span
          ><select v-model="direction">
            <option value="s2t">简体 → 繁体</option>
            <option value="t2s">繁体 → 简体</option>
          </select></label
        >
        <label v-if="mode === 'pronunciation'" class="tool-field"
          ><span>朗读语速：{{ rate.toFixed(1) }}</span
          ><input v-model.number="rate" type="range" min="0.5" max="2" step="0.1"
        /></label>
        <ToolActions>
          <button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="processing"
            @click="run"
          >
            <IconLanguage :size="16" aria-hidden="true" />{{
              processing ? '处理中…' : mode === 'translation' ? '翻译' : '处理'
            }}
          </button>
          <button
            v-if="mode === 'pronunciation'"
            type="button"
            class="tool-button tool-button--secondary"
            @click="speak"
          >
            <IconPlayerPlay :size="16" aria-hidden="true" />朗读
          </button>
          <button
            v-if="mode === 'pronunciation'"
            type="button"
            class="tool-button tool-button--quiet"
            @click="stop"
          >
            <IconPlayerStop :size="16" aria-hidden="true" />停止
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput
      :title="mode === 'translation' ? '翻译结果' : '处理结果'"
      :value="output"
      filename="language-result.txt"
    />
  </div>
</template>
