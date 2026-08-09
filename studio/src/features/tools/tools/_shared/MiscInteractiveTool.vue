<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { IconPlayerPause, IconPlayerPlay, IconRefresh, IconSparkles } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { calculateExpression, elements, randomAnswer } from './misc-utils';
type Mode = 'timer' | 'keyboard' | 'calculation' | 'periodic' | 'globe' | 'answer';
const props = defineProps<{ mode: Mode }>();
const minutes = ref(5);
const remaining = ref(300);
const running = ref(false);
let interval = 0;
const pressed = ref<string[]>([]);
const history = ref<string[]>([]);
const expression = ref('(12 + 8) * 3 / 2');
const output = ref('');
const error = ref('');
const search = ref('');
const rotation = ref(24);
const timerText = computed(
  () =>
    `${String(Math.floor(remaining.value / 60)).padStart(2, '0')}:${String(remaining.value % 60).padStart(2, '0')}`,
);
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  return elements.filter(
    (item) =>
      !term ||
      item.symbol.toLowerCase().includes(term) ||
      item.name.includes(term) ||
      String(item.atomicNumber) === term,
  );
});
function toggleTimer(): void {
  if (running.value) {
    clearInterval(interval);
    running.value = false;
    return;
  }
  if (remaining.value <= 0) remaining.value = Math.max(1, minutes.value * 60);
  running.value = true;
  interval = window.setInterval(() => {
    remaining.value -= 1;
    if (remaining.value <= 0) {
      clearInterval(interval);
      running.value = false;
      remaining.value = 0;
    }
  }, 1000);
}
function resetTimer(): void {
  clearInterval(interval);
  running.value = false;
  remaining.value = Math.max(1, Math.round(minutes.value * 60));
}
function keyDown(event: KeyboardEvent): void {
  if (props.mode !== 'keyboard') return;
  event.preventDefault();
  if (!pressed.value.includes(event.code)) pressed.value = [...pressed.value, event.code];
  const combo = [
    event.ctrlKey ? 'Ctrl' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    event.metaKey ? 'Meta' : '',
    event.key,
  ]
    .filter(Boolean)
    .join(' + ');
  history.value = [combo, ...history.value.filter((item) => item !== combo)].slice(0, 12);
}
function keyUp(event: KeyboardEvent): void {
  pressed.value = pressed.value.filter((item) => item !== event.code);
}
function run(): void {
  error.value = '';
  try {
    if (props.mode === 'calculation') output.value = String(calculateExpression(expression.value));
    else if (props.mode === 'answer') output.value = randomAnswer();
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '处理失败。';
  }
}
onMounted(() => {
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
});
onBeforeUnmount(() => {
  clearInterval(interval);
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
});
</script>
<template>
  <div class="tool-workspace-grid">
    <ToolSection
      :title="
        mode === 'timer'
          ? '计时器'
          : mode === 'keyboard'
            ? '键盘可视化'
            : mode === 'calculation'
              ? '计算草稿纸'
              : mode === 'periodic'
                ? '元素周期表'
                : mode === 'globe'
                  ? '3D 地球'
                  : '答案之书'
      "
      description="浏览器本地交互工具。"
      ><div class="tool-stack">
        <template v-if="mode === 'timer'"
          ><div class="tool-timer-display">{{ timerText }}</div>
          <label class="tool-field"
            ><span>分钟</span
            ><input
              v-model.number="minutes"
              type="number"
              min="0.02"
              max="1440"
              step="1"
              @change="resetTimer" /></label
          ><ToolActions
            ><button type="button" class="tool-button tool-button--primary" @click="toggleTimer">
              <IconPlayerPause v-if="running" :size="16" /><IconPlayerPlay v-else :size="16" />{{
                running ? '暂停' : '开始'
              }}</button
            ><button type="button" class="tool-button tool-button--quiet" @click="resetTimer">
              <IconRefresh :size="16" />重置
            </button></ToolActions
          ></template
        >
        <template v-else-if="mode === 'keyboard'"
          ><div class="tool-keyboard-stage" tabindex="0">
            <strong>{{ pressed.length ? pressed.join(' + ') : '按下任意按键' }}</strong
            ><span>点击此区域后测试组合键；页面会阻止默认快捷键。</span>
          </div>
          <ol class="tool-key-history">
            <li v-for="item in history" :key="item">{{ item }}</li>
          </ol></template
        >
        <template v-else-if="mode === 'calculation'"
          ><ToolInput v-model="expression" label="算式" :rows="6" /><ToolActions
            ><button type="button" class="tool-button tool-button--primary" @click="run">
              计算
            </button></ToolActions
          >
          <p v-if="error" class="tool-status tool-status--error">{{ error }}</p></template
        >
        <template v-else-if="mode === 'periodic'"
          ><label class="tool-field"
            ><span>搜索元素</span><input v-model="search" placeholder="元素名、符号或原子序数"
          /></label>
          <div class="tool-elements">
            <article v-for="item in filtered" :key="item.atomicNumber">
              <small>{{ item.atomicNumber }}</small
              ><strong>{{ item.symbol }}</strong
              ><span>{{ item.name }}</span>
            </article>
          </div></template
        >
        <template v-else-if="mode === 'globe'"
          ><label class="tool-field"
            ><span>旋转角度：{{ rotation }}°</span
            ><input v-model.number="rotation" type="range" min="-180" max="180"
          /></label>
          <div class="tool-globe-stage">
            <div
              class="tool-css-globe"
              :style="{ transform: `rotateX(-12deg) rotateY(${rotation}deg)` }"
            >
              <span
                v-for="index in 12"
                :key="index"
                :style="{ transform: `rotateY(${index * 30}deg)` }"
              ></span>
            </div></div
        ></template>
        <template v-else
          ><p class="tool-answer">{{ output || '在心里想好问题，然后翻开答案。' }}</p>
          <ToolActions
            ><button type="button" class="tool-button tool-button--primary" @click="run">
              <IconSparkles :size="16" />翻开答案
            </button></ToolActions
          ></template
        >
      </div></ToolSection
    ><ToolOutput
      v-if="['calculation', 'answer'].includes(mode)"
      title="结果"
      :value="output"
      filename="misc-result.txt"
    />
  </div>
  <ToolHelp
    :steps="['按页面提示输入或操作。', '在当前浏览器完成交互。', '按需复制结果。']"
    note="计时器在页面休眠时可能受浏览器节流影响，不用于高精度计时。"
  />
</template>
