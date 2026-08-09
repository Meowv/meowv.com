<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { IconTrash } from '@tabler/icons-vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';

interface KeySpec { code: string; label: string; width?: number }
const k = (code: string, label: string, width = 1): KeySpec => ({ code, label, width });
const mainRows: KeySpec[][] = [
  [k('Escape','Esc'), k('F1','F1'), k('F2','F2'), k('F3','F3'), k('F4','F4'), k('F5','F5'), k('F6','F6'), k('F7','F7'), k('F8','F8'), k('F9','F9'), k('F10','F10'), k('F11','F11'), k('F12','F12'), k('PrintScreen','PrtSc'), k('ScrollLock','ScrLk'), k('Pause','Pause')],
  [k('Backquote','`'), k('Digit1','1'), k('Digit2','2'), k('Digit3','3'), k('Digit4','4'), k('Digit5','5'), k('Digit6','6'), k('Digit7','7'), k('Digit8','8'), k('Digit9','9'), k('Digit0','0'), k('Minus','-'), k('Equal','='), k('Backspace','Backspace',2), k('Insert','Ins'), k('Home','Home'), k('PageUp','PgUp')],
  [k('Tab','Tab',1.5), k('KeyQ','Q'), k('KeyW','W'), k('KeyE','E'), k('KeyR','R'), k('KeyT','T'), k('KeyY','Y'), k('KeyU','U'), k('KeyI','I'), k('KeyO','O'), k('KeyP','P'), k('BracketLeft','['), k('BracketRight',']'), k('Backslash','\\',1.5), k('Delete','Del'), k('End','End'), k('PageDown','PgDn')],
  [k('CapsLock','Caps',1.8), k('KeyA','A'), k('KeyS','S'), k('KeyD','D'), k('KeyF','F'), k('KeyG','G'), k('KeyH','H'), k('KeyJ','J'), k('KeyK','K'), k('KeyL','L'), k('Semicolon',';'), k('Quote',"'"), k('Enter','Enter',2.2)],
  [k('ShiftLeft','Shift',2.3), k('KeyZ','Z'), k('KeyX','X'), k('KeyC','C'), k('KeyV','V'), k('KeyB','B'), k('KeyN','N'), k('KeyM','M'), k('Comma',','), k('Period','.'), k('Slash','/'), k('ShiftRight','Shift',2.7), k('ArrowUp','↑')],
  [k('ControlLeft','Ctrl',1.4), k('MetaLeft','Win',1.3), k('AltLeft','Alt',1.3), k('Space','Space',6.2), k('AltRight','Alt',1.3), k('MetaRight','Win',1.3), k('ContextMenu','Menu',1.3), k('ControlRight','Ctrl',1.4), k('ArrowLeft','←'), k('ArrowDown','↓'), k('ArrowRight','→')],
];
const numpadRows: KeySpec[][] = [
  [k('NumLock','Num'), k('NumpadDivide','/'), k('NumpadMultiply','*'), k('NumpadSubtract','-')],
  [k('Numpad7','7'), k('Numpad8','8'), k('Numpad9','9'), k('NumpadAdd','+',1)],
  [k('Numpad4','4'), k('Numpad5','5'), k('Numpad6','6'), k('NumpadAdd','+',1)],
  [k('Numpad1','1'), k('Numpad2','2'), k('Numpad3','3'), k('NumpadEnter','Enter',1)],
  [k('Numpad0','0',2), k('NumpadDecimal','.'), k('NumpadEnter','Enter',1)],
];

const layout = ref<'104' | 'tkl'>('104');
const active = ref(false);
const pressed = ref<string[]>([]);
const history = ref<Array<{ code: string; key: string; type: 'down' | 'up'; time: string }>>([]);

function record(event: KeyboardEvent, type: 'down' | 'up'): void {
  history.value = [{ code: event.code, key: event.key === ' ' ? 'Space' : event.key, type, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }, ...history.value].slice(0, 20);
}
function keyDown(event: KeyboardEvent): void {
  if (!active.value) return;
  event.preventDefault();
  if (!pressed.value.includes(event.code)) pressed.value = [...pressed.value, event.code];
  if (!event.repeat) record(event, 'down');
}
function keyUp(event: KeyboardEvent): void {
  if (!active.value) return;
  event.preventDefault();
  pressed.value = pressed.value.filter((code) => code !== event.code);
  record(event, 'up');
}
function releaseAll(): void { pressed.value = []; }
function activate(): void { active.value = true; }
function deactivate(): void { active.value = false; releaseAll(); }

onMounted(() => {
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', deactivate);
  document.addEventListener('visibilitychange', releaseAll);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
  window.removeEventListener('blur', deactivate);
  document.removeEventListener('visibilitychange', releaseAll);
});
</script>

<template>
  <section class="keyboard-tool">
    <header class="keyboard-tool__toolbar">
      <div class="tool-segmented" role="group" aria-label="键盘布局">
        <button type="button" :class="{ active: layout === '104' }" @click="layout = '104'">104 键</button>
        <button type="button" :class="{ active: layout === 'tkl' }" @click="layout = 'tkl'">TKL 87 键</button>
      </div>
      <span :class="['keyboard-tool__focus', { active }]">{{ active ? '正在捕获按键' : '点击键盘区域开始测试' }}</span>
      <button type="button" class="tool-button tool-button--quiet" @click="history = []"><IconTrash :size="15" aria-hidden="true" />清空记录</button>
    </header>
    <div class="keyboard-tool__content">
      <div class="keyboard-tool__stage" tabindex="0" @focus="activate" @blur="deactivate">
        <div class="keyboard-tool__main">
          <div v-for="(row, rowIndex) in mainRows" :key="rowIndex" class="keyboard-tool__row">
            <span v-for="key in row" :key="key.code" class="keyboard-tool__key" :class="{ pressed: pressed.includes(key.code) }" :style="{ '--key-width': key.width ?? 1 }">{{ key.label }}<small>{{ key.code }}</small></span>
          </div>
        </div>
        <div v-if="layout === '104'" class="keyboard-tool__numpad">
          <div v-for="(row, rowIndex) in numpadRows" :key="rowIndex" class="keyboard-tool__row">
            <span v-for="key in row" :key="key.code" class="keyboard-tool__key" :class="{ pressed: pressed.includes(key.code) }" :style="{ '--key-width': key.width ?? 1 }">{{ key.label }}</span>
          </div>
        </div>
      </div>
      <aside class="keyboard-tool__history">
        <h2>按键事件</h2>
        <p v-if="!history.length">按下任意按键后显示 code 与 key。</p>
        <ol><li v-for="(item, index) in history" :key="`${item.time}-${index}`"><span :class="item.type">{{ item.type }}</span><strong>{{ item.code }}</strong><code>{{ item.key }}</code><time>{{ item.time }}</time></li></ol>
      </aside>
    </div>
  </section>
  <ToolHelp :steps="['选择 104 键或 TKL 布局。', '点击键盘区域，让它获得焦点。', '按下实体键盘按键并查看 code、key 与按下/释放状态。']" note="只有测试区域获得焦点时才会阻止浏览器默认快捷键；窗口失焦或页面切换会立即释放全部高亮。" />
</template>

<style scoped>
.keyboard-tool { overflow: hidden; border: 1px solid var(--color-border); border-radius: 13px; background: var(--color-surface); }
.keyboard-tool__toolbar { display: flex; min-height: 58px; padding: 10px 13px; align-items: center; gap: 12px; border-bottom: 1px solid var(--color-border); }
.keyboard-tool__focus { flex: 1; color: var(--color-text-muted); font-size: 10px; }.keyboard-tool__focus.active { color: var(--tools-accent); }
.keyboard-tool__content { display: grid; grid-template-columns: minmax(0, 1fr) 260px; }
.keyboard-tool__stage { display: flex; overflow-x: auto; min-height: 430px; padding: 28px 22px; align-items: center; justify-content: center; gap: 15px; outline: none; background: var(--color-surface-muted); }
.keyboard-tool__stage:focus-visible { box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--tools-accent) 28%, transparent); }
.keyboard-tool__main { min-width: 760px; }.keyboard-tool__numpad { width: 210px; min-width: 210px; }
.keyboard-tool__row { display: flex; margin-bottom: 6px; gap: 5px; }
.keyboard-tool__key { display: flex; width: calc(38px * var(--key-width)); height: 42px; flex: 0 0 calc(38px * var(--key-width)); align-items: center; justify-content: center; flex-direction: column; border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text); background: var(--color-surface); box-shadow: 0 3px 0 color-mix(in srgb, var(--color-border) 86%, #000); font-size: 10px; transition: .08s; }
.keyboard-tool__key small { overflow: hidden; max-width: 100%; color: var(--color-text-muted); font-size: 6px; text-overflow: ellipsis; }.keyboard-tool__key.pressed { border-color: var(--tools-accent); color: #fff; background: var(--tools-accent); box-shadow: 0 1px 0 color-mix(in srgb, var(--tools-accent) 70%, #000); transform: translateY(2px); }.keyboard-tool__key.pressed small { color: rgb(255 255 255 / 75%); }
.keyboard-tool__history { overflow: auto; max-height: 430px; padding: 14px; border-left: 1px solid var(--color-border); }.keyboard-tool__history h2 { margin: 0 0 10px; font-size: 12px; }.keyboard-tool__history p { color: var(--color-text-muted); font-size: 10px; }.keyboard-tool__history ol { margin: 0; padding: 0; list-style: none; }.keyboard-tool__history li { display: grid; padding: 7px 0; grid-template-columns: 32px 1fr auto; gap: 6px; border-bottom: 1px solid var(--color-border); font-size: 9px; }.keyboard-tool__history li span { color: #4ea43c; }.keyboard-tool__history li span.up { color: #e08b28; }.keyboard-tool__history li code { color: var(--color-text-muted); }.keyboard-tool__history li time { grid-column: 2 / -1; color: var(--color-text-muted); font-size: 8px; }
@media (max-width: 1000px) { .keyboard-tool__content { grid-template-columns: 1fr; }.keyboard-tool__history { max-height: 220px; border-top: 1px solid var(--color-border); border-left: 0; } }
</style>
