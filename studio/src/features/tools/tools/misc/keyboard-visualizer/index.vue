<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  type CSSProperties,
  type Ref,
} from 'vue';
import {
  IconInfoCircle,
  IconKeyboard,
  IconMaximize,
  IconMinimize,
  IconRefresh,
  IconShieldCheck,
} from '@tabler/icons-vue';
import {
  allKeyboardKeys,
  FULL_KEY_COUNT,
  functionGroups,
  functionNav,
  keyboardRows,
  numpadCodes,
  TKL_KEY_COUNT,
  type KeyboardKey,
} from './keyboard-layout';

type Platform = 'windows' | 'mac';
type KeyboardLayout = 'full' | 'tkl';
type LightEffect = 'reactive' | 'ripple' | 'rainbow';

interface EventDetails {
  code: string;
  key: string;
  type: string;
  location: string;
  repeat: string;
}

const UNIT = 42;
const GAP = 5;
const HOLD_WARNING_TIMEOUT = 30_000;
const functionGroupStarts = [0, 1.67, 6.34, 11.01];
const sectionOffsets = { main: 0, nav: 16.4, numpad: 20.2 };
const preventWhenFocused = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);
const modifierOrder: Record<string, number> = {
  ControlLeft: 1,
  ControlRight: 2,
  AltLeft: 3,
  AltRight: 4,
  ShiftLeft: 5,
  ShiftRight: 6,
  MetaLeft: 7,
  MetaRight: 8,
};
const oppositeModifier: Record<string, string> = {
  ControlLeft: 'ControlRight',
  ControlRight: 'ControlLeft',
  AltLeft: 'AltRight',
  AltRight: 'AltLeft',
  ShiftLeft: 'ShiftRight',
  ShiftRight: 'ShiftLeft',
  MetaLeft: 'MetaRight',
  MetaRight: 'MetaLeft',
};

const platform = ref<Platform>('windows');
const layout = ref<KeyboardLayout>('full');
const effect = ref<LightEffect>('reactive');
const pressedCodes = ref(new Set<string>());
const testedCodes = ref(new Set<string>());
const previewCodes = ref(new Set<string>());
const repeatingCodes = ref(new Set<string>());
const suspectedCodes = ref(new Set<string>());
const pressCount = ref(0);
const maximumPressed = ref(0);
const locks = ref({ caps: false, num: false, scroll: false });
const lastEvent = ref<EventDetails>(emptyEventDetails());
const announcement = ref('点击键盘区域，然后按下任意键开始。');
const isFullscreen = ref(false);
const isComplete = ref(false);
const reducedMotion = ref(false);
const stageRef = ref<HTMLElement | null>(null);
const keyboardRef = ref<HTMLElement | null>(null);

const previewTimers = new Map<string, number>();
const holdTimers = new Map<string, number>();
const suppressedControlCodes = new Set<string>();
const suppressedControlTimers = new Map<string, number>();
const rippleAnimations = new Set<Animation>();
let completionTimer = 0;
let celebrated = false;

const activeKeyboardKeys = computed(() =>
  layout.value === 'tkl'
    ? allKeyboardKeys.filter((item) => !numpadCodes.has(item.code))
    : allKeyboardKeys,
);
const totalKeys = computed(() => (layout.value === 'tkl' ? TKL_KEY_COUNT : FULL_KEY_COUNT));
const keyByCode = computed(() => {
  const entries = activeKeyboardKeys.value.map((item) => [codeForPlatform(item), item] as const);
  return new Map(entries);
});
const layoutOrder = computed(
  () => new Map(activeKeyboardKeys.value.map((item, index) => [codeForPlatform(item), index])),
);
const testedCount = computed(() => {
  const activeCodes = new Set(keyByCode.value.keys());
  return [...testedCodes.value].filter((code) => activeCodes.has(code)).length;
});
const progress = computed(() => (testedCount.value / totalKeys.value) * 100);
const keyboardLabel = computed(
  () =>
    `${platform.value === 'mac' ? 'Mac 标识' : 'Windows'} ${
      layout.value === 'tkl' ? '87 键 TKL' : '104 键'
    }可视化键盘`,
);
const comboKeys = computed(() => {
  const codes = [...pressedCodes.value].sort((left, right) => {
    const rankDiff = (modifierOrder[left] ?? 100) - (modifierOrder[right] ?? 100);
    if (rankDiff) return rankDiff;
    return (layoutOrder.value.get(left) ?? 0) - (layoutOrder.value.get(right) ?? 0);
  });
  return codes.map((code) => ({ code, label: comboLabel(code) }));
});

function emptyEventDetails(): EventDetails {
  return { code: '—', key: '—', type: '—', location: '—', repeat: '—' };
}

function codeForPlatform(item: KeyboardKey): string {
  return platform.value === 'mac' && item.macCode ? item.macCode : item.code;
}

function labelForPlatform(item: KeyboardKey): string {
  return platform.value === 'mac' && item.mac ? item.mac : item.label;
}

function subForPlatform(item: KeyboardKey): string {
  if (platform.value === 'mac' && Object.hasOwn(item, 'macSub')) return item.macSub ?? '';
  return item.sub ?? '';
}

function pixelWidth(width: number): number {
  return UNIT * width + GAP * (width - 1);
}

function itemOffset(items: KeyboardKey[], index: number): number {
  return items.slice(0, index).reduce((sum, item) => sum + item.width, 0);
}

function keyPosition(items: KeyboardKey[], index: number, offset: number): number {
  return offset + itemOffset(items, index) + items[index]!.width / 2;
}

function keyStyle(item: KeyboardKey, x: number, y: number): CSSProperties {
  return {
    width: `${pixelWidth(item.width)}px`,
    '--keyboard-key-hue': Math.round((x * 19 + y * 31 + 188) % 360),
    '--keyboard-wave-delay': `${-2200 + x * 95}ms`,
    '--keyboard-complete-delay': `${Math.abs(x - 10.5) * 22}ms`,
  } as CSSProperties;
}

function placeholderStyle(item: KeyboardKey): CSSProperties {
  return { width: `${pixelWidth(item.width)}px` };
}

function addCode(target: Ref<Set<string>>, code: string): boolean {
  if (target.value.has(code)) return false;
  target.value = new Set(target.value).add(code);
  return true;
}

function removeCode(target: Ref<Set<string>>, code: string): void {
  if (!target.value.has(code)) return;
  const next = new Set(target.value);
  next.delete(code);
  target.value = next;
}

function focusStage(): void {
  stageRef.value?.focus({ preventScroll: true });
}

function announce(message: string): void {
  announcement.value = message;
}

function comboLabel(code: string): string {
  const item = keyByCode.value.get(code);
  let label = item ? labelForPlatform(item) : code;
  const opposite = oppositeModifier[code];
  if (opposite && pressedCodes.value.has(opposite)) {
    label += code.endsWith('Left') ? ' (左)' : ' (右)';
  }
  return label;
}

function setPlatform(nextPlatform: Platform): void {
  clearPressed();
  platform.value = nextPlatform;
  focusStage();
  announce(
    nextPlatform === 'mac'
      ? '已切换 Mac 键帽标识，按键事件仍以 event.code 定位。'
      : '已切换 Windows 键帽标识。',
  );
}

function setLayout(nextLayout: KeyboardLayout): void {
  if (layout.value === nextLayout) {
    focusStage();
    return;
  }
  layout.value = nextLayout;
  resetSession(true);
  announce(`已切换为${nextLayout === 'tkl' ? '87 键 TKL' : '104 键'}配列，检测记录已重置。`);
}

function setEffect(nextEffect: LightEffect): void {
  cancelRippleAnimations();
  effect.value = nextEffect;
  focusStage();
  const names: Record<LightEffect, string> = {
    reactive: '响应',
    ripple: '涟漪',
    rainbow: '彩虹波浪',
  };
  announce(`RGB 灯效已切换为“${names[nextEffect]}”。`);
}

function updateEventDetails(event: KeyboardEvent, type: string): void {
  const locations = ['标准键区', '左侧', '右侧', '数字键区'];
  lastEvent.value = {
    code: event.code || '—',
    key: event.key === ' ' ? '空格' : event.key || '—',
    type,
    location: locations[event.location] ?? '未知',
    repeat: event.repeat ? '是' : '否',
  };
}

function updateLocks(event: KeyboardEvent): void {
  if (!event.getModifierState) return;
  locks.value = {
    caps: event.getModifierState('CapsLock'),
    num: event.getModifierState('NumLock'),
    scroll: event.getModifierState('ScrollLock'),
  };
}

function clearHoldTimer(code: string): void {
  const timer = holdTimers.get(code);
  if (timer !== undefined) window.clearTimeout(timer);
  holdTimers.delete(code);
}

function clearHoldTimers(): void {
  holdTimers.forEach((timer) => window.clearTimeout(timer));
  holdTimers.clear();
}

function scheduleHoldWarning(code: string): void {
  clearHoldTimer(code);
  holdTimers.set(
    code,
    window.setTimeout(() => {
      addCode(suspectedCodes, code);
      holdTimers.delete(code);
      announce(`${code} 已持续按下 30 秒，可能是正常长按，也可能未收到 keyup。`);
    }, HOLD_WARNING_TIMEOUT),
  );
}

function clearPreviewTimers(): void {
  previewTimers.forEach((timer) => window.clearTimeout(timer));
  previewTimers.clear();
}

function cancelRippleAnimations(): void {
  rippleAnimations.forEach((animation) => animation.cancel());
  rippleAnimations.clear();
}

function triggerRipple(source: HTMLElement): void {
  if (effect.value !== 'ripple' || reducedMotion.value || !keyboardRef.value) return;
  const sourceX = Number(source.dataset.x);
  const sourceY = Number(source.dataset.y);
  keyboardRef.value.querySelectorAll<HTMLElement>('.keyboard-visualizer__key').forEach((target) => {
    const code = target.dataset.code;
    if (!code || !keyByCode.value.has(code)) return;
    const distance = Math.hypot(
      Number(target.dataset.x) - sourceX,
      Number(target.dataset.y) - sourceY,
    );
    if (distance > 5.8) return;
    const light = target.querySelector<HTMLElement>('.keyboard-visualizer__key-light');
    if (!light?.animate) return;
    const animation = light.animate(
      [
        { opacity: 0, transform: 'scale(.65)' },
        { opacity: 0.92, transform: 'scale(1.06)', offset: 0.42 },
        { opacity: 0, transform: 'scale(.82)' },
      ],
      { duration: 480, delay: distance * 28, easing: 'ease-out' },
    );
    rippleAnimations.add(animation);
    const cleanup = () => rippleAnimations.delete(animation);
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  });
}

function findKeyElement(code: string): HTMLElement | null {
  return keyboardRef.value?.querySelector<HTMLElement>(`[data-code="${code}"]`) ?? null;
}

function maybeCelebrate(): void {
  if (celebrated || testedCount.value !== totalKeys.value) return;
  celebrated = true;
  isComplete.value = true;
  window.clearTimeout(completionTimer);
  completionTimer = window.setTimeout(() => (isComplete.value = false), 1500);
  announce('已检测到全部可视化键位的响应。');
}

function isControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"])',
      ),
    )
  );
}

function suppressControlCode(code: string): void {
  if (!code) return;
  const previous = suppressedControlTimers.get(code);
  if (previous !== undefined) window.clearTimeout(previous);
  suppressedControlCodes.add(code);
  suppressedControlTimers.set(
    code,
    window.setTimeout(() => {
      suppressedControlCodes.delete(code);
      suppressedControlTimers.delete(code);
    }, 5000),
  );
}

function consumeSuppressedControlCode(code: string): boolean {
  if (!suppressedControlCodes.has(code)) return false;
  suppressedControlCodes.delete(code);
  const timer = suppressedControlTimers.get(code);
  if (timer !== undefined) window.clearTimeout(timer);
  suppressedControlTimers.delete(code);
  return true;
}

function clearSuppressedControls(): void {
  suppressedControlTimers.forEach((timer) => window.clearTimeout(timer));
  suppressedControlTimers.clear();
  suppressedControlCodes.clear();
}

function handleKeyDown(event: KeyboardEvent): void {
  if (isControlTarget(event.target)) {
    suppressControlCode(event.code);
    return;
  }
  updateLocks(event);
  const item = keyByCode.value.get(event.code);
  if (!item) {
    updateEventDetails(event, '未展示');
    return;
  }
  if (document.activeElement === stageRef.value && preventWhenFocused.has(event.code)) {
    event.preventDefault();
  }
  updateEventDetails(event, '按下');
  removeCode(suspectedCodes, event.code);
  if (event.repeat || pressedCodes.value.has(event.code)) {
    addCode(repeatingCodes, event.code);
    return;
  }
  addCode(pressedCodes, event.code);
  addCode(testedCodes, event.code);
  removeCode(repeatingCodes, event.code);
  pressCount.value += 1;
  maximumPressed.value = Math.max(maximumPressed.value, pressedCodes.value.size);
  scheduleHoldWarning(event.code);
  void nextTick(() => {
    const keyElement = findKeyElement(event.code);
    if (keyElement) triggerRipple(keyElement);
  });
  maybeCelebrate();
}

function handleKeyUp(event: KeyboardEvent): void {
  if (consumeSuppressedControlCode(event.code)) return;
  const item = keyByCode.value.get(event.code);
  if (!item) {
    if (!isControlTarget(event.target)) updateEventDetails(event, '未展示');
    return;
  }
  if (isControlTarget(event.target) && !pressedCodes.value.has(event.code)) return;
  updateLocks(event);
  updateEventDetails(event, '松开');
  clearHoldTimer(event.code);
  removeCode(pressedCodes, event.code);
  removeCode(repeatingCodes, event.code);
  removeCode(suspectedCodes, event.code);
  addCode(testedCodes, event.code);
  maybeCelebrate();
}

function clearPressed(message?: string): void {
  clearHoldTimers();
  pressedCodes.value = new Set();
  repeatingCodes.value = new Set();
  suspectedCodes.value = new Set();
  if (message) announce(message);
}

function resetSession(silent = false): void {
  window.clearTimeout(completionTimer);
  clearPressed();
  clearPreviewTimers();
  cancelRippleAnimations();
  testedCodes.value = new Set();
  previewCodes.value = new Set();
  pressCount.value = 0;
  maximumPressed.value = 0;
  locks.value = { caps: false, num: false, scroll: false };
  lastEvent.value = emptyEventDetails();
  isComplete.value = false;
  celebrated = false;
  focusStage();
  if (!silent) announce('检测记录已重置，按下任意键重新开始。');
}

function previewKey(event: PointerEvent, item: KeyboardKey): void {
  const element = event.currentTarget as HTMLElement;
  const code = codeForPlatform(item);
  if (event.pointerType !== 'touch') event.preventDefault();
  focusStage();
  const previous = previewTimers.get(code);
  if (previous !== undefined) window.clearTimeout(previous);
  addCode(previewCodes, code);
  triggerRipple(element);
  previewTimers.set(
    code,
    window.setTimeout(() => {
      removeCode(previewCodes, code);
      previewTimers.delete(code);
    }, 180),
  );
  announce(`虚拟键帽预览 · ${comboLabel(code)}（不计入检测）`);
}

function handleStagePointerDown(event: PointerEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest('.keyboard-visualizer__key')) return;
  if (event.pointerType !== 'touch') event.preventDefault();
  focusStage();
}

async function toggleFullscreen(): Promise<void> {
  const stage = stageRef.value;
  if (!stage || !document.fullscreenEnabled || !stage.requestFullscreen) {
    announce('当前浏览器不支持页面沉浸模式。');
    focusStage();
    return;
  }
  try {
    if (document.fullscreenElement === stage) await document.exitFullscreen();
    else await stage.requestFullscreen();
    focusStage();
  } catch {
    announce('未能切换沉浸模式，请检查浏览器权限。');
    focusStage();
  }
}

function syncFullscreen(): void {
  isFullscreen.value = document.fullscreenElement === stageRef.value;
  announce(isFullscreen.value ? '已进入沉浸模式。' : '已退出沉浸模式。');
}

function handleVisibilityChange(): void {
  if (document.hidden) clearPressed('页面已转入后台，按下状态已清除。');
}

function handleWindowBlur(): void {
  clearPressed('窗口已失去焦点，按下状态已清除。');
}

function handlePageHide(): void {
  clearPressed();
}

onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('pagehide', handlePageHide);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('fullscreenchange', syncFullscreen);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('blur', handleWindowBlur);
  window.removeEventListener('pagehide', handlePageHide);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener('fullscreenchange', syncFullscreen);
  clearHoldTimers();
  clearPreviewTimers();
  clearSuppressedControls();
  cancelRippleAnimations();
  window.clearTimeout(completionTimer);
});
</script>

<template>
  <section class="keyboard-visualizer">
    <span class="keyboard-visualizer__sr-only" aria-live="polite">{{ announcement }}</span>

    <div class="keyboard-visualizer__toolbar" aria-label="键盘可视化设置">
      <div class="keyboard-visualizer__control">
        <span class="keyboard-visualizer__control-label">键帽标识</span>
        <div class="keyboard-visualizer__options" role="group" aria-label="键帽标识">
          <button
            type="button"
            :class="['keyboard-visualizer__option', { 'is-active': platform === 'windows' }]"
            :aria-pressed="platform === 'windows'"
            @click="setPlatform('windows')"
          >
            Windows
          </button>
          <button
            type="button"
            :class="['keyboard-visualizer__option', { 'is-active': platform === 'mac' }]"
            :aria-pressed="platform === 'mac'"
            title="切换常用 Mac 键帽标识与修饰键位置"
            @click="setPlatform('mac')"
          >
            Mac
          </button>
        </div>
      </div>

      <div class="keyboard-visualizer__control">
        <span class="keyboard-visualizer__control-label">键盘配列</span>
        <div class="keyboard-visualizer__options" role="group" aria-label="键盘配列">
          <button
            type="button"
            :class="['keyboard-visualizer__option', { 'is-active': layout === 'full' }]"
            :aria-pressed="layout === 'full'"
            @click="setLayout('full')"
          >
            104 键
          </button>
          <button
            type="button"
            :class="['keyboard-visualizer__option', { 'is-active': layout === 'tkl' }]"
            :aria-pressed="layout === 'tkl'"
            @click="setLayout('tkl')"
          >
            87 键 TKL
          </button>
        </div>
      </div>

      <div class="keyboard-visualizer__control">
        <span class="keyboard-visualizer__control-label">RGB 灯效</span>
        <div class="keyboard-visualizer__options" role="group" aria-label="RGB 灯效">
          <button
            v-for="option in [
              { value: 'reactive', label: '响应' },
              { value: 'ripple', label: '涟漪' },
              { value: 'rainbow', label: '彩虹波浪' },
            ] as const"
            :key="option.value"
            type="button"
            :class="['keyboard-visualizer__option', { 'is-active': effect === option.value }]"
            :aria-pressed="effect === option.value"
            @click="setEffect(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="keyboard-visualizer__actions">
        <button type="button" class="tool-button tool-button--quiet" @click="resetSession()">
          <IconRefresh :size="15" aria-hidden="true" />重置记录
        </button>
        <button
          type="button"
          class="tool-button tool-button--quiet"
          :aria-label="isFullscreen ? '退出沉浸模式' : '进入沉浸模式'"
          :aria-pressed="isFullscreen"
          @click="toggleFullscreen"
        >
          <IconMinimize v-if="isFullscreen" :size="15" aria-hidden="true" />
          <IconMaximize v-else :size="15" aria-hidden="true" />
          {{ isFullscreen ? '退出沉浸' : '沉浸模式' }}
        </button>
      </div>
    </div>

    <section
      ref="stageRef"
      class="keyboard-visualizer__stage"
      :class="{ 'is-complete': isComplete }"
      :data-layout="layout"
      tabindex="0"
      aria-label="键盘事件捕获区域"
      @pointerdown="handleStagePointerDown"
    >
      <div class="keyboard-visualizer__stage-top">
        <span class="keyboard-visualizer__brand">
          MEOWV // {{ layout === 'tkl' ? 'TKL 87' : 'FULL SIZE 104' }}
        </span>
        <div class="keyboard-visualizer__stage-controls">
          <div class="keyboard-visualizer__locks" aria-label="锁定键状态">
            <span
              class="keyboard-visualizer__lock"
              :class="{ 'is-on': locks.caps }"
              :aria-label="`Caps Lock：${locks.caps ? '开' : '关'}`"
            >
              <span class="keyboard-visualizer__lock-dot"></span>CAPS
              <span>{{ locks.caps ? 'ON' : 'OFF' }}</span>
            </span>
            <span
              v-if="layout === 'full'"
              class="keyboard-visualizer__lock"
              :class="{ 'is-on': locks.num }"
              :aria-label="`Num Lock：${locks.num ? '开' : '关'}`"
            >
              <span class="keyboard-visualizer__lock-dot"></span>NUM
              <span>{{ locks.num ? 'ON' : 'OFF' }}</span>
            </span>
            <span
              class="keyboard-visualizer__lock"
              :class="{ 'is-on': locks.scroll }"
              :aria-label="`Scroll Lock：${locks.scroll ? '开' : '关'}`"
            >
              <span class="keyboard-visualizer__lock-dot"></span>SCROLL
              <span>{{ locks.scroll ? 'ON' : 'OFF' }}</span>
            </span>
          </div>
          <button
            v-if="isFullscreen"
            type="button"
            class="keyboard-visualizer__stage-exit"
            aria-label="退出沉浸模式"
            @click="toggleFullscreen"
          >
            <IconMinimize :size="14" aria-hidden="true" />退出沉浸
          </button>
        </div>
      </div>

      <div class="keyboard-visualizer__combo">
        <span class="keyboard-visualizer__combo-label">当前组合键</span>
        <div class="keyboard-visualizer__combo-keys">
          <span v-if="!comboKeys.length" class="keyboard-visualizer__combo-empty">等待按键</span>
          <template v-for="(item, index) in comboKeys" :key="item.code">
            <span v-if="index" class="keyboard-visualizer__combo-plus">+</span>
            <span class="keyboard-visualizer__combo-key">{{ item.label }}</span>
          </template>
        </div>
      </div>

      <div
        class="keyboard-visualizer__keyboard-scroll"
        role="region"
        aria-label="可横向滚动的完整键盘"
      >
        <div
          ref="keyboardRef"
          class="keyboard-visualizer__keyboard"
          :data-effect="effect"
          :data-layout="layout"
          role="img"
          :aria-label="keyboardLabel"
        >
          <div class="keyboard-visualizer__function-row">
            <div class="keyboard-visualizer__function-main">
              <div
                v-for="(group, groupIndex) in functionGroups"
                :key="groupIndex"
                class="keyboard-visualizer__function-group"
              >
                <div
                  v-for="(item, itemIndex) in group"
                  :key="item.code"
                  class="keyboard-visualizer__key"
                  :class="{
                    'is-wide': item.width > 1,
                    'is-pressed': pressedCodes.has(codeForPlatform(item)),
                    'is-preview': previewCodes.has(codeForPlatform(item)),
                    'is-repeating': repeatingCodes.has(codeForPlatform(item)),
                    'is-suspected': suspectedCodes.has(codeForPlatform(item)),
                    'is-tested': testedCodes.has(codeForPlatform(item)),
                  }"
                  :style="
                    keyStyle(
                      item,
                      keyPosition(group, itemIndex, functionGroupStarts[groupIndex] ?? 0),
                      0,
                    )
                  "
                  :data-code="codeForPlatform(item)"
                  :data-x="keyPosition(group, itemIndex, functionGroupStarts[groupIndex] ?? 0)"
                  :data-y="0"
                  :title="`${labelForPlatform(item)} · ${codeForPlatform(item)}`"
                  @pointerdown="previewKey($event, item)"
                >
                  <span class="keyboard-visualizer__key-light"></span>
                  <span class="keyboard-visualizer__key-cap">
                    <span class="keyboard-visualizer__key-sub">{{ subForPlatform(item) }}</span>
                    <span>{{ labelForPlatform(item) }}</span>
                  </span>
                </div>
              </div>
            </div>

            <div class="keyboard-visualizer__section keyboard-visualizer__function-nav">
              <div
                v-for="(item, itemIndex) in functionNav"
                :key="item.code"
                class="keyboard-visualizer__key"
                :class="{
                  'is-pressed': pressedCodes.has(codeForPlatform(item)),
                  'is-preview': previewCodes.has(codeForPlatform(item)),
                  'is-repeating': repeatingCodes.has(codeForPlatform(item)),
                  'is-suspected': suspectedCodes.has(codeForPlatform(item)),
                  'is-tested': testedCodes.has(codeForPlatform(item)),
                }"
                :style="keyStyle(item, keyPosition(functionNav, itemIndex, sectionOffsets.nav), 0)"
                :data-code="codeForPlatform(item)"
                :data-x="keyPosition(functionNav, itemIndex, sectionOffsets.nav)"
                :data-y="0"
                :title="`${labelForPlatform(item)} · ${codeForPlatform(item)}`"
                @pointerdown="previewKey($event, item)"
              >
                <span class="keyboard-visualizer__key-light"></span>
                <span class="keyboard-visualizer__key-cap">
                  <span class="keyboard-visualizer__key-sub">{{ subForPlatform(item) }}</span>
                  <span>{{ labelForPlatform(item) }}</span>
                </span>
              </div>
            </div>
            <div class="keyboard-visualizer__function-spacer"></div>
          </div>

          <div
            v-for="(row, rowIndex) in keyboardRows"
            :key="rowIndex"
            class="keyboard-visualizer__keyboard-row"
          >
            <div
              v-for="section in ['main', 'nav', 'numpad'] as const"
              :key="section"
              :class="['keyboard-visualizer__section', `keyboard-visualizer__${section}-section`]"
            >
              <template v-for="(item, itemIndex) in row[section]" :key="`${section}-${itemIndex}`">
                <span
                  v-if="item.placeholder"
                  class="keyboard-visualizer__key-placeholder"
                  :style="placeholderStyle(item)"
                  aria-hidden="true"
                ></span>
                <div
                  v-else
                  class="keyboard-visualizer__key"
                  :class="{
                    'is-wide': item.width > 1,
                    'is-tall': item.tall,
                    'has-sub': subForPlatform(item),
                    'is-pressed': pressedCodes.has(codeForPlatform(item)),
                    'is-preview': previewCodes.has(codeForPlatform(item)),
                    'is-repeating': repeatingCodes.has(codeForPlatform(item)),
                    'is-suspected': suspectedCodes.has(codeForPlatform(item)),
                    'is-tested': testedCodes.has(codeForPlatform(item)),
                  }"
                  :style="
                    keyStyle(
                      item,
                      keyPosition(row[section], itemIndex, sectionOffsets[section]),
                      rowIndex + 1,
                    )
                  "
                  :data-code="codeForPlatform(item)"
                  :data-x="keyPosition(row[section], itemIndex, sectionOffsets[section])"
                  :data-y="rowIndex + 1"
                  :title="`${labelForPlatform(item)} · ${codeForPlatform(item)}`"
                  @pointerdown="previewKey($event, item)"
                >
                  <span class="keyboard-visualizer__key-light"></span>
                  <span class="keyboard-visualizer__key-cap">
                    <span class="keyboard-visualizer__key-sub">{{ subForPlatform(item) }}</span>
                    <span>{{ labelForPlatform(item) }}</span>
                  </span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
      <p class="keyboard-visualizer__mobile-hint">
        建议使用电脑连接实体键盘体验；手机端可横向滑动并点按键帽预览动画，预览不会计入检测。
      </p>
    </section>

    <div class="keyboard-visualizer__stats" aria-label="键盘检测统计">
      <div class="keyboard-visualizer__stat">
        <span>已检测按键</span>
        <strong>{{ testedCount }} / {{ totalKeys }}</strong>
        <div class="keyboard-visualizer__progress" aria-hidden="true">
          <span :style="{ width: `${progress}%` }"></span>
        </div>
      </div>
      <div class="keyboard-visualizer__stat">
        <span>当前按下</span>
        <strong>{{ pressedCodes.size }}</strong>
      </div>
      <div class="keyboard-visualizer__stat">
        <span>最高同时按下</span>
        <strong>{{ maximumPressed }}</strong>
      </div>
      <div class="keyboard-visualizer__stat">
        <span>本次有效按下</span>
        <strong>{{ pressCount }}</strong>
      </div>
    </div>

    <div class="keyboard-visualizer__details">
      <section class="keyboard-visualizer__panel" aria-labelledby="keyboard-event-title">
        <h2 id="keyboard-event-title">最近一次键盘事件</h2>
        <div class="keyboard-visualizer__event-grid">
          <div v-for="(value, label) in lastEvent" :key="label">
            <span>{{
              {
                code: 'event.code',
                key: 'event.key',
                type: '事件状态',
                location: '按键位置',
                repeat: '长按重复',
              }[label]
            }}</span>
            <strong>{{ value }}</strong>
          </div>
        </div>
      </section>

      <section class="keyboard-visualizer__panel" aria-labelledby="keyboard-notes-title">
        <h2 id="keyboard-notes-title">检测说明</h2>
        <div class="keyboard-visualizer__notes">
          <p>
            <IconShieldCheck :size="16" aria-hidden="true" />
            <span
              >本地处理 ·
              不保存输入内容。按键事件只在当前页面内完成，页面也不会拼接或上传可还原的输入文本。</span
            >
          </p>
          <p>
            <IconInfoCircle :size="16" aria-hidden="true" />
            <span
              >Fn、亮度键及部分系统或浏览器快捷键可能被拦截，因此未亮起不一定代表键盘故障。</span
            >
          </p>
          <p>
            <IconKeyboard :size="16" aria-hidden="true" />
            <span>未配备数字小键盘时请选择 87 键 TKL；切换配列会重置本次检测记录。</span>
          </p>
          <p>
            <IconKeyboard :size="16" aria-hidden="true" />
            <span>Mac 模式用于常用键帽标识与修饰键位置切换，不代表完整 Apple 键盘配列。</span>
          </p>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.keyboard-visualizer {
  --keyboard-line: var(--color-border);
  --keyboard-muted: var(--color-text-muted);

  width: 100%;
  min-width: 0;
  color: var(--color-text);
}

.keyboard-visualizer__sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
}

.keyboard-visualizer__toolbar {
  display: flex;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid var(--keyboard-line);
  border-radius: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 12px 18px;
  background: var(--color-surface-solid);
  box-shadow: 0 4px 18px rgb(16 24 40 / 3%);
}

.keyboard-visualizer__control {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.keyboard-visualizer__control-label {
  color: var(--keyboard-muted);
  font-size: 10px;
  line-height: 1;
}

.keyboard-visualizer__options {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
}

.keyboard-visualizer__option {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--keyboard-line);
  border-radius: 17px;
  outline: none;
  background: var(--color-surface-solid);
  color: var(--keyboard-muted);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: 680;
  transition:
    border-color 150ms ease,
    color 150ms ease,
    background 150ms ease,
    box-shadow 150ms ease;
}

.keyboard-visualizer__option:hover {
  border-color: color-mix(in srgb, var(--tools-accent) 38%, var(--keyboard-line));
  color: var(--tools-accent);
}

.keyboard-visualizer__option:focus-visible {
  border-color: var(--tools-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 16%, transparent);
}

.keyboard-visualizer__option.is-active {
  border-color: transparent;
  background: var(--tools-accent);
  color: #fff;
  box-shadow: 0 3px 8px color-mix(in srgb, var(--tools-accent) 20%, transparent);
}

.keyboard-visualizer__actions {
  display: flex;
  margin-left: auto;
  gap: 7px;
}

.keyboard-visualizer__stage {
  position: relative;
  width: 100%;
  min-width: 0;
  padding: 16px;
  overflow: hidden;
  border: 1px solid #252c37;
  border-radius: 16px;
  outline: none;
  background:
    radial-gradient(circle at 50% 0, rgb(71 91 123 / 18%), transparent 42%),
    linear-gradient(145deg, #11151c, #090c11);
  box-shadow:
    0 18px 38px rgb(23 31 43 / 20%),
    inset 0 1px 0 rgb(255 255 255 / 6%);
  color: #e9edf5;
}

.keyboard-visualizer__stage-top {
  display: flex;
  margin: 0 4px 12px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.keyboard-visualizer__brand {
  color: #96a0b1;
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
}

.keyboard-visualizer__stage-controls,
.keyboard-visualizer__locks,
.keyboard-visualizer__lock {
  display: flex;
  align-items: center;
}

.keyboard-visualizer__stage-controls {
  gap: 12px;
}

.keyboard-visualizer__locks {
  gap: 12px;
}

.keyboard-visualizer__lock {
  gap: 5px;
  color: #6f7888;
  font-size: 9px;
  letter-spacing: 0.04em;
}

.keyboard-visualizer__lock > span:last-child {
  color: #687181;
  font-size: 7px;
}

.keyboard-visualizer__lock-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #343c48;
  box-shadow: inset 0 1px 1px rgb(0 0 0 / 50%);
}

.keyboard-visualizer__lock.is-on,
.keyboard-visualizer__lock.is-on > span:last-child {
  color: #c9ff7a;
}

.keyboard-visualizer__lock.is-on .keyboard-visualizer__lock-dot {
  background: #9cff32;
  box-shadow: 0 0 8px rgb(156 255 50 / 85%);
}

.keyboard-visualizer__stage-exit {
  display: inline-flex;
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid #465166;
  border-radius: 16px;
  outline: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #252d39;
  color: #dbe1eb;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
}

.keyboard-visualizer__stage-exit:focus-visible {
  border-color: #9cff32;
  box-shadow: 0 0 0 3px rgb(156 255 50 / 16%);
}

.keyboard-visualizer__combo {
  display: flex;
  min-height: 48px;
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 10px;
  align-items: center;
  gap: 12px;
  background: rgb(255 255 255 / 3.5%);
}

.keyboard-visualizer__combo-label {
  flex: 0 0 auto;
  color: #737e8f;
  font-size: 10px;
}

.keyboard-visualizer__combo-keys {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.keyboard-visualizer__combo-empty {
  color: #8d97a6;
  font-size: 11px;
}

.keyboard-visualizer__combo-key {
  display: inline-flex;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid #485466;
  border-radius: 6px;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #333c49, #202630);
  box-shadow: 0 2px 0 #090c10;
  color: #f4f7fb;
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
}

.keyboard-visualizer__combo-plus {
  color: #667183;
  font-size: 10px;
}

.keyboard-visualizer__keyboard-scroll {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 3px 2px 9px;
  overflow-x: auto;
  overflow-y: hidden;
  border-radius: 12px;
  outline: none;
  scrollbar-color: #465166 #171c25;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.keyboard-visualizer__keyboard-scroll::-webkit-scrollbar {
  height: 8px;
}

.keyboard-visualizer__keyboard-scroll::-webkit-scrollbar-track {
  border-radius: 5px;
  background: #171c25;
}

.keyboard-visualizer__keyboard-scroll::-webkit-scrollbar-thumb {
  border-radius: 5px;
  background: #465166;
}

.keyboard-visualizer__keyboard {
  --keyboard-unit: 42px;
  --keyboard-gap: 5px;

  width: 1087px;
  min-width: 1087px;
  margin: 0 auto;
  padding: 18px;
  border: 1px solid #303844;
  border-radius: 13px;
  box-sizing: border-box;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 4.5%), transparent 28%),
    linear-gradient(160deg, #272e38, #161b23 72%);
  box-shadow:
    0 10px 24px rgb(0 0 0 / 36%),
    inset 0 1px 0 rgb(255 255 255 / 8%),
    inset 0 -2px 0 rgb(0 0 0 / 38%);
  user-select: none;
  touch-action: pan-x pan-y;
}

.keyboard-visualizer__keyboard[data-layout='tkl'] {
  width: 888px;
  min-width: 888px;
}

.keyboard-visualizer__keyboard[data-layout='tkl'] .keyboard-visualizer__numpad-section,
.keyboard-visualizer__keyboard[data-layout='tkl'] .keyboard-visualizer__function-spacer {
  display: none;
}

.keyboard-visualizer__function-row,
.keyboard-visualizer__keyboard-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.keyboard-visualizer__function-row {
  margin-bottom: 14px;
}

.keyboard-visualizer__keyboard-row {
  height: var(--keyboard-unit);
  margin-bottom: var(--keyboard-gap);
}

.keyboard-visualizer__keyboard-row:last-child {
  margin-bottom: 0;
}

.keyboard-visualizer__section,
.keyboard-visualizer__function-main,
.keyboard-visualizer__function-group {
  display: flex;
  align-items: flex-start;
  gap: var(--keyboard-gap);
}

.keyboard-visualizer__main-section,
.keyboard-visualizer__function-main {
  width: 700px;
  flex: 0 0 700px;
}

.keyboard-visualizer__function-main {
  justify-content: space-between;
}

.keyboard-visualizer__nav-section,
.keyboard-visualizer__function-nav {
  width: 136px;
  flex: 0 0 136px;
}

.keyboard-visualizer__numpad-section,
.keyboard-visualizer__function-spacer {
  width: 183px;
  flex: 0 0 183px;
}

.keyboard-visualizer__key,
.keyboard-visualizer__key-placeholder {
  position: relative;
  width: var(--keyboard-unit);
  height: var(--keyboard-unit);
  flex: 0 0 auto;
  box-sizing: border-box;
}

.keyboard-visualizer__key {
  z-index: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.keyboard-visualizer__key.is-tall {
  z-index: 3;
  height: 89px;
}

.keyboard-visualizer__key-light {
  position: absolute;
  z-index: 0;
  inset: 3px;
  border-radius: 8px;
  opacity: 0;
  background: hsl(var(--keyboard-key-hue) 96% 62%);
  filter: blur(8px);
  transform: scale(0.78);
  transition:
    opacity 320ms ease,
    transform 200ms ease;
  pointer-events: none;
}

.keyboard-visualizer__key-cap {
  position: absolute;
  z-index: 1;
  inset: 0 0 4px;
  display: flex;
  padding: 5px;
  overflow: hidden;
  border: 1px solid #4a5361;
  border-radius: 7px;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 9%), transparent 32%),
    linear-gradient(180deg, #3b4350, #282f39);
  box-shadow:
    0 4px 0 #11151b,
    0 6px 7px rgb(0 0 0 / 28%),
    inset 0 1px 0 rgb(255 255 255 / 9%);
  color: #e4e8ef;
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.05;
  text-align: center;
  transform: translateY(0);
  transition:
    transform 70ms ease-out,
    box-shadow 70ms ease-out,
    border-color 140ms ease,
    color 140ms ease;
}

.keyboard-visualizer__key.is-wide .keyboard-visualizer__key-cap {
  padding: 7px 8px;
  align-items: flex-start;
  justify-content: flex-start;
  font-size: 9px;
}

.keyboard-visualizer__key.is-tall .keyboard-visualizer__key-cap {
  padding: 9px 7px;
  align-items: flex-end;
  justify-content: flex-end;
}

.keyboard-visualizer__key-sub {
  position: absolute;
  top: 5px;
  left: 6px;
  color: #99a3b2;
  font-size: 7px;
  font-weight: 500;
}

.keyboard-visualizer__key.is-wide .keyboard-visualizer__key-sub {
  top: auto;
  right: 7px;
  bottom: 6px;
  left: auto;
}

.keyboard-visualizer__key.is-pressed .keyboard-visualizer__key-light,
.keyboard-visualizer__key.is-preview .keyboard-visualizer__key-light {
  opacity: 0.98;
  transform: scale(1.12);
}

.keyboard-visualizer__key.is-pressed .keyboard-visualizer__key-cap,
.keyboard-visualizer__key.is-preview .keyboard-visualizer__key-cap {
  border-color: hsl(var(--keyboard-key-hue) 72% 61%);
  color: #fff;
  box-shadow:
    0 1px 0 #11151b,
    0 2px 3px rgb(0 0 0 / 32%),
    inset 0 0 12px hsl(var(--keyboard-key-hue) 88% 62% / 17%);
  transform: translateY(4px);
}

.keyboard-visualizer__key.is-repeating .keyboard-visualizer__key-cap {
  border-color: #f3c45d;
}

.keyboard-visualizer__key.is-suspected .keyboard-visualizer__key-cap {
  border-color: #ff6961;
  box-shadow:
    0 1px 0 #11151b,
    0 0 10px rgb(255 105 97 / 34%),
    inset 0 0 9px rgb(255 105 97 / 12%);
}

.keyboard-visualizer__key.is-tested .keyboard-visualizer__key-cap::after {
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #8ddd31;
  box-shadow: 0 0 5px rgb(141 221 49 / 72%);
  content: '';
}

.keyboard-visualizer__keyboard[data-effect='rainbow'] .keyboard-visualizer__key-light {
  opacity: 0.54;
  transform: scale(0.9);
  animation: keyboard-rainbow-wave 2.2s ease-in-out infinite;
  animation-delay: var(--keyboard-wave-delay);
}

.keyboard-visualizer__keyboard[data-effect='rainbow']
  .keyboard-visualizer__key.is-pressed
  .keyboard-visualizer__key-light {
  opacity: 1;
  transform: scale(1.14);
}

.keyboard-visualizer__stage.is-complete .keyboard-visualizer__key-light {
  animation: keyboard-complete 850ms ease-out both;
  animation-delay: var(--keyboard-complete-delay);
}

.keyboard-visualizer__mobile-hint {
  display: none;
  margin: 11px 2px 0;
  color: #8994a5;
  font-size: 10px;
  line-height: 1.5;
  text-align: center;
}

.keyboard-visualizer__stats {
  display: grid;
  margin-top: 14px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.keyboard-visualizer__stat,
.keyboard-visualizer__panel {
  border: 1px solid var(--keyboard-line);
  background: var(--color-surface-solid);
}

.keyboard-visualizer__stat {
  min-width: 0;
  padding: 12px 13px;
  border-radius: 9px;
}

.keyboard-visualizer__stat > span {
  display: block;
  margin-bottom: 4px;
  color: var(--keyboard-muted);
  font-size: 10px;
}

.keyboard-visualizer__stat > strong {
  display: block;
  overflow: hidden;
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keyboard-visualizer__progress {
  height: 3px;
  margin-top: 7px;
  overflow: hidden;
  border-radius: 3px;
  background: color-mix(in srgb, var(--keyboard-line) 70%, transparent);
}

.keyboard-visualizer__progress span {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: var(--tools-accent);
  transition: width 250ms ease;
}

.keyboard-visualizer__details {
  display: grid;
  margin-top: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.keyboard-visualizer__panel {
  padding: 15px;
  border-radius: 9px;
}

.keyboard-visualizer__panel h2 {
  margin: 0 0 12px;
  color: var(--color-text);
  font-size: 12px;
}

.keyboard-visualizer__event-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.keyboard-visualizer__event-grid > div {
  min-width: 0;
}

.keyboard-visualizer__event-grid span,
.keyboard-visualizer__event-grid strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keyboard-visualizer__event-grid span {
  margin-bottom: 4px;
  color: var(--keyboard-muted);
  font-size: 9px;
}

.keyboard-visualizer__event-grid strong {
  color: var(--color-text);
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 10px;
  font-weight: 500;
}

.keyboard-visualizer__notes {
  display: grid;
  gap: 8px;
}

.keyboard-visualizer__notes p {
  display: flex;
  margin: 0;
  align-items: flex-start;
  gap: 8px;
  color: var(--keyboard-muted);
  font-size: 10px;
  line-height: 1.55;
}

.keyboard-visualizer__notes svg {
  margin-top: 1px;
  flex: 0 0 auto;
  color: var(--tools-accent);
}

.keyboard-visualizer__stage:fullscreen {
  --keyboard-fullscreen-scale: 1;
  --keyboard-fullscreen-height: 335px;

  display: flex;
  width: 100vw;
  height: 100vh;
  padding: 28px;
  overflow: auto;
  border: 0;
  border-radius: 0;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  background: radial-gradient(circle at 50% 0, rgb(71 91 123 / 24%), transparent 48%), #090c11;
  box-shadow: none;
}

.keyboard-visualizer__stage:fullscreen .keyboard-visualizer__stage-top,
.keyboard-visualizer__stage:fullscreen .keyboard-visualizer__combo {
  width: min(1320px, 100%);
  margin-right: auto;
  margin-left: auto;
}

.keyboard-visualizer__stage:fullscreen .keyboard-visualizer__keyboard-scroll {
  width: min(1600px, 100%);
  min-height: var(--keyboard-fullscreen-height);
  margin-right: auto;
  margin-left: auto;
}

.keyboard-visualizer__stage:fullscreen .keyboard-visualizer__keyboard {
  transform: scale(var(--keyboard-fullscreen-scale));
  transform-origin: top center;
}

@keyframes keyboard-rainbow-wave {
  0%,
  100% {
    opacity: 0.28;
    transform: scale(0.76);
  }
  50% {
    opacity: 0.78;
    transform: scale(1.03);
  }
}

@keyframes keyboard-complete {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.75);
  }
  48% {
    opacity: 1;
    transform: scale(1.15);
  }
}

@media (prefers-reduced-motion: reduce) {
  .keyboard-visualizer__option,
  .keyboard-visualizer__key-light,
  .keyboard-visualizer__key-cap,
  .keyboard-visualizer__progress span {
    transition-duration: 0.01ms !important;
  }

  .keyboard-visualizer__keyboard[data-effect='rainbow'] .keyboard-visualizer__key-light {
    opacity: 0.3;
    animation: none !important;
  }

  .keyboard-visualizer__stage.is-complete .keyboard-visualizer__key-light {
    animation: none !important;
  }
}

@media (min-width: 1280px) {
  .keyboard-visualizer__stage:fullscreen {
    --keyboard-fullscreen-scale: 1.1;
    --keyboard-fullscreen-height: 365px;
  }
}

@media (min-width: 1440px) {
  .keyboard-visualizer__stage:fullscreen {
    --keyboard-fullscreen-scale: 1.2;
    --keyboard-fullscreen-height: 400px;
  }
}

@media (min-width: 1680px) {
  .keyboard-visualizer__stage:fullscreen {
    --keyboard-fullscreen-scale: 1.34;
    --keyboard-fullscreen-height: 445px;
  }
}

@media (min-width: 1920px) {
  .keyboard-visualizer__stage:fullscreen {
    --keyboard-fullscreen-scale: 1.5;
    --keyboard-fullscreen-height: 495px;
  }
}

@media (max-height: 640px) {
  .keyboard-visualizer__stage:fullscreen {
    justify-content: flex-start;
  }
}

@media (max-width: 900px) {
  .keyboard-visualizer__actions {
    width: 100%;
    margin-left: 0;
  }

  .keyboard-visualizer__event-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 601px) {
  .keyboard-visualizer__toolbar {
    padding: 11px;
    align-items: stretch;
  }

  .keyboard-visualizer__control {
    width: 100%;
  }

  .keyboard-visualizer__options,
  .keyboard-visualizer__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .keyboard-visualizer__option {
    width: 100%;
    padding: 0 8px;
  }

  .keyboard-visualizer__stage {
    padding: 11px;
    border-radius: 12px;
  }

  .keyboard-visualizer__stage-top {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .keyboard-visualizer__brand {
    font-size: 9px;
  }

  .keyboard-visualizer__locks {
    gap: 7px;
  }

  .keyboard-visualizer__lock {
    gap: 3px;
    font-size: 8px;
  }

  .keyboard-visualizer__combo {
    min-height: 58px;
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }

  .keyboard-visualizer__mobile-hint {
    display: block;
  }

  .keyboard-visualizer__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .keyboard-visualizer__stat {
    padding: 10px;
  }

  .keyboard-visualizer__details {
    grid-template-columns: 1fr;
  }

  .keyboard-visualizer__event-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .keyboard-visualizer__stage:fullscreen {
    padding: 12px;
  }
}
</style>
