<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import {
  IconBook2,
  IconBrandSpeedtest,
  IconCamera,
  IconCheck,
  IconCube,
  IconDice5,
  IconKeyboard,
  IconPlayerPlay,
  IconRefresh,
  IconRoute,
  IconSettings,
  IconShare3,
  IconSparkles,
} from '@tabler/icons-vue';
import CubeNetEditor from './components/CubeNetEditor.vue';
import CubePlaybackControls from './components/CubePlaybackControls.vue';
import CubeSettingsPanel from './components/CubeSettingsPanel.vue';
import CubeSolutionPanel from './components/CubeSolutionPanel.vue';
import CubeViewport from './components/CubeViewport.vue';
import { applyMove, clonePosition, positionToFacelets, solvedPosition } from './core/cube';
import {
  describeMove,
  formatAlgorithm,
  invertAlgorithm,
  invertMove,
  parseAlgorithm,
} from './core/notation';
import { CubingCubeSolver } from './solver/cubing-solver';
import { useCubeStore } from './stores/cube-store';
import type {
  CubeHistoryItem,
  CubeMode,
  CubeMove,
  CubePosition,
  CubeSolution,
  Face,
  ScanClassification,
  StickerRef,
} from './types';
import './cube-solver.css';

const CubeCameraScanner = defineAsyncComponent(() => import('./components/CubeCameraScanner.vue'));

type MobilePanel = 'input' | 'steps' | 'teaching' | 'settings';
type ViewportExpose = {
  animateMove(move: CubeMove, nextFacelets: readonly Face[], duration: number): Promise<void>;
  cancelAnimation(): void;
};

const route = useRoute();
const router = useRouter();
const store = useCubeStore();
store.initialize();
const {
  mode,
  inputMethod,
  draft,
  position,
  validationIssues,
  editStatus,
  solverStatus,
  solverMessage,
  solution,
  playbackCursor,
  playbackStatus,
  selectedColor,
  activeFace,
  lowConfidence,
  history,
  preferences,
  generation,
  undoStack,
  redoStack,
  colorCounts,
  canAutoFill,
  currentMove,
  currentPhase,
} = storeToRefs(store);

const solver = new CubingCubeSolver();
const workbench = ref<HTMLElement | null>(null);
const viewport = ref<ViewportExpose | null>(null);
const stateInput = ref('');
const formulaInput = ref("R U R' U'");
const formulaMessage = ref('');
const loopFormula = ref(false);
const cameraMessage = ref('');
const operationBusy = ref(false);
const mobilePanel = ref<MobilePanel>(mode.value === 'beginner' ? 'teaching' : 'input');
const announcement = ref('魔方工作台已准备好。');
const shareFeedback = ref<'idle' | 'copied' | 'error'>('idle');
const sharedStateNotice = ref('');
const moveCount = ref(0);
const practicePast = ref<CubePosition[]>([]);
const practiceFuture = ref<CubePosition[]>([]);
let playbackToken = 0;
let operationToken = 0;
let shareFeedbackTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
let sharedStateNoticeTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
let disposed = false;

const modes: Array<{ id: CubeMode; label: string; description: string }> = [
  { id: 'solve', label: '真实魔方', description: '录入并还原手中的魔方' },
  { id: 'algorithm', label: '公式演示', description: '播放和反转标准公式' },
  { id: 'practice', label: '自由练习', description: '拖动、按键和随机打乱' },
  { id: 'beginner', label: '新手教学', description: '按照七个目标逐步跟练' },
];

const inputMethods = [
  { id: 'manual' as const, label: '手动录入' },
  { id: 'camera' as const, label: '相机扫描' },
  { id: 'state' as const, label: '状态字符串' },
];
const mobilePanels: Array<{ id: MobilePanel; label: string }> = [
  { id: 'input', label: '录入' },
  { id: 'steps', label: '步骤' },
  { id: 'teaching', label: '教学' },
  { id: 'settings', label: '设置' },
];

const movePad = [
  'U',
  "U'",
  'U2',
  'R',
  "R'",
  'R2',
  'F',
  "F'",
  'F2',
  'D',
  "D'",
  'D2',
  'L',
  "L'",
  'L2',
  'B',
  "B'",
  'B2',
];
const facelets = computed(() => draft.value.facelets);
const totalMoves = computed(() => solution.value?.moves.length ?? 0);
const isPlaying = computed(() => playbackStatus.value === 'playing');
const canSolve = computed(() => editStatus.value === 'valid' && !operationBusy.value);
const validationLabel = computed(() => {
  if (editStatus.value === 'valid') return '状态合法，可以开始还原。';
  if (editStatus.value === 'draft') return '请继续录入所有贴纸。';
  return validationIssues.value[0]?.message ?? '当前状态不合法。';
});
const normalizedFormula = computed(() => {
  try {
    return formatAlgorithm(parseAlgorithm(formulaInput.value));
  } catch {
    return '';
  }
});
const inverseFormula = computed(() => {
  try {
    return formatAlgorithm(invertAlgorithm(parseAlgorithm(formulaInput.value)));
  } catch {
    return '';
  }
});

function selectMode(next: CubeMode): void {
  stopPlayback();
  operationToken += 1;
  operationBusy.value = false;
  viewport.value?.cancelAnimation();
  store.selectMode(next);
  mobilePanel.value = next === 'beginner' ? 'teaching' : 'input';
  announcement.value = `已切换到${modes.find((item) => item.id === next)?.label ?? next}。`;
}

function selectMobilePanel(next: MobilePanel): void {
  if (next === 'teaching' && mode.value !== 'beginner') selectMode('beginner');
  else if (next === 'input' && mode.value === 'beginner') selectMode('solve');
  mobilePanel.value = next;
}

function resultForMoves(
  resultMode: CubeSolution['mode'],
  baseline: CubePosition,
  moves: CubeMove[],
): CubeSolution {
  return {
    mode: resultMode,
    algorithm: formatAlgorithm(moves),
    moves,
    moveCount: moves.length,
    baseline: clonePosition(baseline),
    phases: [],
    revision: draft.value.revision,
  };
}

async function runSolve(beginner = false): Promise<void> {
  if (!canSolve.value) return;
  stopPlayback();
  if (beginner && mode.value !== 'beginner') store.selectMode('beginner');
  const revision = draft.value.revision;
  const requestGeneration = generation.value;
  const token = ++operationToken;
  operationBusy.value = true;
  solverStatus.value = 'loading';
  solverMessage.value = '';
  try {
    await solver.initialize();
    if (disposed || revision !== draft.value.revision || requestGeneration !== generation.value)
      return;
    solverStatus.value = 'solving';
    const result = beginner
      ? await solver.solveBeginner(position.value, revision)
      : await solver.solve(position.value, revision);
    if (disposed || revision !== draft.value.revision || requestGeneration !== generation.value)
      return;
    store.setSolution(result);
    store.addHistory(mode.value === 'practice' ? 'scramble' : inputMethod.value, result);
    mobilePanel.value = beginner ? 'teaching' : 'steps';
    announcement.value = result.moves.length
      ? `已生成 ${result.moves.length} 步${beginner ? '七阶段引导' : '快速还原方案'}。`
      : '当前魔方已经还原。';
  } catch (error) {
    if (disposed || revision !== draft.value.revision) return;
    solverStatus.value = 'error';
    solverMessage.value = error instanceof Error ? error.message : '求解失败，请重试。';
    announcement.value = solverMessage.value;
  } finally {
    if (token === operationToken) operationBusy.value = false;
  }
}

function prepareFormula(): void {
  stopPlayback();
  try {
    const moves = parseAlgorithm(formulaInput.value);
    if (!moves.length) throw new Error('请输入至少一个面转动。');
    formulaInput.value = formatAlgorithm(moves);
    store.setSolution(resultForMoves('algorithm', position.value, moves));
    formulaMessage.value = `已载入 ${moves.length} 步公式。`;
    mobilePanel.value = 'steps';
  } catch (error) {
    formulaMessage.value = error instanceof Error ? error.message : '公式格式不正确。';
  }
}

function useInverseFormula(): void {
  if (!inverseFormula.value) return;
  formulaInput.value = inverseFormula.value;
  prepareFormula();
}

async function randomScramble(): Promise<void> {
  stopPlayback();
  const requestGeneration = generation.value;
  const token = ++operationToken;
  operationBusy.value = true;
  solverMessage.value = '';
  try {
    const moves = await solver.randomScramble();
    if (disposed || requestGeneration !== generation.value) return;
    const result = resultForMoves('practice', solvedPosition(), moves);
    store.setSolution(result);
    store.seek(moves.length);
    moveCount.value = 0;
    practicePast.value = [];
    practiceFuture.value = [];
    announcement.value = `已生成 ${moves.length} 步随机打乱。`;
  } catch (error) {
    solverMessage.value = error instanceof Error ? error.message : '无法生成随机打乱。';
  } finally {
    if (token === operationToken) operationBusy.value = false;
  }
}

function resetPractice(): void {
  stopPlayback();
  store.setPosition(solvedPosition());
  moveCount.value = 0;
  practicePast.value = [];
  practiceFuture.value = [];
  announcement.value = '虚拟魔方已重置。';
}

async function animateMove(move: CubeMove, after: CubePosition): Promise<void> {
  const duration = 300 / preferences.value.animationSpeed;
  await viewport.value?.animateMove(move, positionToFacelets(after), duration);
}

async function performPracticeMove(move: CubeMove, recordHistory = true): Promise<void> {
  if (operationBusy.value || editStatus.value !== 'valid') return;
  stopPlayback();
  const requestGeneration = generation.value;
  const token = ++operationToken;
  operationBusy.value = true;
  const before = clonePosition(position.value);
  const after = applyMove(before, move);
  try {
    await animateMove(move, after);
    if (token !== operationToken || requestGeneration !== generation.value) return;
    if (recordHistory) {
      practicePast.value.push(before);
      practiceFuture.value = [];
      moveCount.value += 1;
    }
    store.setPosition(after);
    announcement.value = `${move.notation}：${describeMove(move)}`;
  } catch {
    // 新操作或页面离开导致动画取消时不提交状态。
  } finally {
    if (token === operationToken) operationBusy.value = false;
  }
}

function performNotation(notation: string): void {
  const [move] = parseAlgorithm(notation);
  if (move) void performPracticeMove(move);
}

async function practiceUndo(): Promise<void> {
  const previous = practicePast.value.pop();
  if (!previous || operationBusy.value) return;
  practiceFuture.value.push(clonePosition(position.value));
  store.setPosition(previous);
  moveCount.value = Math.max(0, moveCount.value - 1);
}

function practiceRedo(): void {
  const next = practiceFuture.value.pop();
  if (!next || operationBusy.value) return;
  practicePast.value.push(clonePosition(position.value));
  store.setPosition(next);
  moveCount.value += 1;
}

async function nextStep(continuePlaying = false): Promise<boolean> {
  const result = solution.value;
  if (!result || playbackCursor.value >= result.moves.length || operationBusy.value) return false;
  const move = result.moves[playbackCursor.value]!;
  const after = applyMove(position.value, move);
  const requestGeneration = generation.value;
  const token = ++operationToken;
  operationBusy.value = true;
  try {
    await animateMove(move, after);
    if (token !== operationToken || requestGeneration !== generation.value) return false;
    store.seek(playbackCursor.value + 1);
    if (continuePlaying && playbackCursor.value < result.moves.length)
      playbackStatus.value = 'playing';
    announcement.value = `${move.notation}，${describeMove(move)}`;
    return true;
  } catch {
    return false;
  } finally {
    if (token === operationToken) operationBusy.value = false;
  }
}

async function previousStep(): Promise<void> {
  const result = solution.value;
  if (!result || playbackCursor.value <= 0 || operationBusy.value) return;
  stopPlayback();
  const move = invertMove(result.moves[playbackCursor.value - 1]!);
  const after = applyMove(position.value, move);
  const requestGeneration = generation.value;
  const token = ++operationToken;
  operationBusy.value = true;
  try {
    await animateMove(move, after);
    if (token !== operationToken || requestGeneration !== generation.value) return;
    store.seek(playbackCursor.value - 1);
  } catch {
    // 动画取消时保持原游标。
  } finally {
    if (token === operationToken) operationBusy.value = false;
  }
}

function seek(cursor: number): void {
  stopPlayback();
  store.seek(cursor);
}

function stopPlayback(): void {
  playbackToken += 1;
  if (playbackStatus.value === 'playing') playbackStatus.value = 'paused';
}

async function togglePlayback(): Promise<void> {
  if (isPlaying.value) {
    stopPlayback();
    return;
  }
  if (!solution.value?.moves.length) return;
  const token = ++playbackToken;
  if (playbackCursor.value >= totalMoves.value) store.seek(0);
  playbackStatus.value = 'playing';
  do {
    let cycleCompleted = true;
    while (token === playbackToken && playbackCursor.value < totalMoves.value) {
      const moved = await nextStep(true);
      if (!moved) {
        cycleCompleted = false;
        break;
      }
    }
    if (token !== playbackToken) return;
    if (
      cycleCompleted &&
      mode.value === 'algorithm' &&
      loopFormula.value &&
      solution.value?.moves.length
    ) {
      store.seek(0);
      playbackStatus.value = 'playing';
      continue;
    }
    break;
  } while (token === playbackToken);
  if (token === playbackToken) {
    playbackStatus.value = playbackCursor.value >= totalMoves.value ? 'completed' : 'paused';
  }
}

function handleViewportMove(move: CubeMove): void {
  if (mode.value === 'practice') void performPracticeMove(move);
}

function handleStickerClick(sticker: StickerRef): void {
  if (mode.value === 'solve' && inputMethod.value === 'manual') {
    store.setSticker(sticker.face, sticker.index);
  }
}

function handleScanComplete(result: ScanClassification): void {
  cameraMessage.value = '';
  store.loadFacelets(result.facelets, result.lowConfidence);
  inputMethod.value = 'manual';
  announcement.value = result.lowConfidence.length
    ? `扫描完成，请复核 ${result.lowConfidence.length} 个虚线标记贴纸。`
    : '扫描完成，状态已录入。';
}

function handleCameraFallback(message: string): void {
  cameraMessage.value = message;
  inputMethod.value = 'manual';
  announcement.value = message;
}

function loadStateInput(): void {
  if (store.loadFaceletString(stateInput.value)) {
    stateInput.value = '';
    announcement.value = '状态字符串已载入并通过校验。';
  } else announcement.value = validationIssues.value[0]?.message ?? '状态字符串无法载入。';
}

async function shareState(): Promise<void> {
  if (editStatus.value !== 'valid') return;
  const url = new URL(globalThis.location.href);
  url.hash = `cube=v1:${store.faceletString}`;
  if (shareFeedbackTimer !== undefined) globalThis.clearTimeout(shareFeedbackTimer);
  try {
    await navigator.clipboard.writeText(url.toString());
    shareFeedback.value = 'copied';
    announcement.value = '当前状态的分享链接已复制。';
  } catch {
    shareFeedback.value = 'error';
    announcement.value = '分享链接复制失败，请重试或检查剪贴板权限。';
  }
  shareFeedbackTimer = globalThis.setTimeout(() => {
    shareFeedback.value = 'idle';
    shareFeedbackTimer = undefined;
  }, 1800);
}

async function loadSharedState(hash: string): Promise<void> {
  const match = /^#cube=v1:([URFDLB]{54})$/i.exec(hash);
  if (!match) return;
  if (store.loadFaceletString(match[1]!)) {
    inputMethod.value = 'manual';
    mode.value = 'solve';
    await router.replace({ path: route.path, query: route.query, hash: '' });
    const message = '分享状态已导入，后续操作会自动保存在本地。';
    announcement.value = message;
    sharedStateNotice.value = message;
    if (sharedStateNoticeTimer !== undefined) {
      globalThis.clearTimeout(sharedStateNoticeTimer);
    }
    sharedStateNoticeTimer = globalThis.setTimeout(() => {
      sharedStateNotice.value = '';
      sharedStateNoticeTimer = undefined;
    }, 3200);
  }
}

function updatePreferences(value: typeof preferences.value): void {
  preferences.value = value;
}

function loadHistory(item: CubeHistoryItem): void {
  store.loadHistory(item);
  mobilePanel.value = 'input';
}

function isTextControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

function handleKeydown(event: KeyboardEvent): void {
  const root = workbench.value;
  const target = event.target instanceof Node ? event.target : null;
  if (!root || ((!target || !root.contains(target)) && !root.contains(document.activeElement)))
    return;
  if (isTextControl(event.target)) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (mode.value === 'practice') {
      if (event.shiftKey) practiceRedo();
      else void practiceUndo();
    } else if (event.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (event.code === 'Space' && solution.value) {
    event.preventDefault();
    void togglePlayback();
    return;
  }
  if (event.key === 'ArrowLeft' && solution.value) {
    event.preventDefault();
    void previousStep();
    return;
  }
  if (event.key === 'ArrowRight' && solution.value) {
    event.preventDefault();
    void nextStep();
    return;
  }
  const face = event.key.toUpperCase();
  if (mode.value === 'practice' && ['U', 'R', 'F', 'D', 'L', 'B'].includes(face)) {
    event.preventDefault();
    const notation = `${face}${event.shiftKey ? "'" : ''}`;
    void performPracticeMove(parseAlgorithm(notation)[0]!);
  }
}

watch(
  () => route.hash,
  (hash) => void loadSharedState(hash),
);

watch(
  () => draft.value.revision,
  () => {
    operationToken += 1;
    operationBusy.value = false;
    viewport.value?.cancelAnimation();
  },
);

onMounted(() => {
  void loadSharedState(route.hash);
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  disposed = true;
  stopPlayback();
  if (shareFeedbackTimer !== undefined) globalThis.clearTimeout(shareFeedbackTimer);
  if (sharedStateNoticeTimer !== undefined) globalThis.clearTimeout(sharedStateNoticeTimer);
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <section
    ref="workbench"
    class="cube-solver"
    :class="[`cube-solver--${mode}`, `cube-solver--mobile-${mobilePanel}`]"
    tabindex="-1"
    aria-label="3D 魔方还原工作台"
  >
    <p class="visually-hidden" aria-live="polite">{{ announcement }}</p>
    <p v-if="sharedStateNotice" class="cube-status-toast" role="status">
      <IconCheck :size="16" aria-hidden="true" />{{ sharedStateNotice }}
    </p>

    <nav class="cube-mode-tabs" aria-label="魔方工具模式">
      <button
        v-for="item in modes"
        :key="item.id"
        type="button"
        :class="{ 'is-active': mode === item.id }"
        :aria-pressed="mode === item.id"
        @click="selectMode(item.id)"
      >
        <IconCube v-if="item.id === 'solve'" :size="17" aria-hidden="true" />
        <IconRoute v-else-if="item.id === 'algorithm'" :size="17" aria-hidden="true" />
        <IconKeyboard v-else-if="item.id === 'practice'" :size="17" aria-hidden="true" />
        <IconBook2 v-else :size="17" aria-hidden="true" />
        <span
          ><strong>{{ item.label }}</strong
          ><small>{{ item.description }}</small></span
        >
      </button>
    </nav>

    <nav class="cube-mobile-tabs" aria-label="移动端工作区面板">
      <button
        v-for="item in mobilePanels"
        :key="item.id"
        type="button"
        :class="{ 'is-active': mobilePanel === item.id }"
        :aria-pressed="mobilePanel === item.id"
        @click="selectMobilePanel(item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <div class="cube-workbench">
      <aside class="cube-side-panel cube-side-panel--input" aria-label="录入和操作">
        <section v-if="mode === 'solve'" class="cube-input-panel">
          <h2 class="visually-hidden">真实魔方状态录入</h2>
          <div class="cube-subtabs" role="group" aria-label="状态录入方式">
            <button
              v-for="item in inputMethods"
              :key="item.id"
              type="button"
              :class="{ 'is-active': inputMethod === item.id }"
              :aria-pressed="inputMethod === item.id"
              @click="inputMethod = item.id"
            >
              <IconCamera v-if="item.id === 'camera'" :size="14" aria-hidden="true" />{{
                item.label
              }}
            </button>
          </div>

          <template v-if="inputMethod === 'manual'">
            <CubeNetEditor
              :facelets="facelets"
              :color-scheme="preferences.colorScheme"
              :selected-color="selectedColor"
              :active-face="activeFace"
              :counts="colorCounts"
              :issues="validationIssues"
              :low-confidence="lowConfidence"
              :can-auto-fill="canAutoFill"
              :can-undo="undoStack.length > 0"
              :can-redo="redoStack.length > 0"
              @update:selected-color="selectedColor = $event"
              @update:active-face="activeFace = $event"
              @paint="store.setSticker"
              @clear="store.clearDraft"
              @auto-fill="store.autoFill"
              @undo="store.undo"
              @redo="store.redo"
            />
            <p v-if="cameraMessage" class="cube-inline-notice">
              {{ cameraMessage }}
            </p>
          </template>
          <CubeCameraScanner
            v-else-if="inputMethod === 'camera'"
            @complete="handleScanComplete"
            @fallback="handleCameraFallback"
          />
          <div v-else class="cube-state-input">
            <label for="cube-facelet-state">54 位 URFDLB 状态</label>
            <textarea
              id="cube-facelet-state"
              v-model="stateInput"
              maxlength="120"
              spellcheck="false"
              placeholder="UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
            ></textarea>
            <button class="cube-primary-button" type="button" @click="loadStateInput">
              载入并校验
            </button>
          </div>

          <div class="cube-validation" :class="`is-${editStatus}`" role="status">
            <IconCheck v-if="editStatus === 'valid'" :size="16" aria-hidden="true" />
            <span>{{ validationLabel }}</span>
          </div>
          <ul v-if="validationIssues.length && editStatus !== 'draft'" class="cube-issues">
            <li
              v-for="(issue, index) in validationIssues.slice(0, 3)"
              :key="`${issue.code}-${index}`"
            >
              {{ issue.message }}
            </li>
          </ul>
          <div class="cube-solve-actions">
            <button
              class="cube-primary-button"
              type="button"
              :disabled="!canSolve"
              @click="runSolve(false)"
            >
              <IconBrandSpeedtest :size="17" aria-hidden="true" />快速还原
            </button>
            <button type="button" :disabled="!canSolve" @click="runSolve(true)">
              <IconBook2 :size="17" aria-hidden="true" />新手教学
            </button>
            <button
              class="cube-share-button"
              :class="{
                'is-copied': shareFeedback === 'copied',
                'is-error': shareFeedback === 'error',
              }"
              type="button"
              :disabled="editStatus !== 'valid'"
              @click="shareState"
            >
              <IconCheck v-if="shareFeedback === 'copied'" :size="16" aria-hidden="true" />
              <IconShare3 v-else :size="16" aria-hidden="true" />
              {{
                shareFeedback === 'copied'
                  ? '状态已复制'
                  : shareFeedback === 'error'
                    ? '复制失败'
                    : '分享状态'
              }}
            </button>
          </div>
        </section>

        <section v-else-if="mode === 'algorithm'" class="cube-formula-panel">
          <header>
            <IconRoute :size="19" aria-hidden="true" />
            <div>
              <h2>输入标准公式</h2>
              <small>支持 URFDLB、撇号和 2</small>
            </div>
          </header>
          <label class="visually-hidden" for="cube-formula-input">标准魔方公式</label>
          <textarea
            id="cube-formula-input"
            v-model="formulaInput"
            spellcheck="false"
            placeholder="R U R' U'"
          ></textarea>
          <p v-if="normalizedFormula"><strong>规范化：</strong>{{ normalizedFormula }}</p>
          <p v-if="inverseFormula"><strong>逆公式：</strong>{{ inverseFormula }}</p>
          <p v-if="formulaMessage" class="cube-inline-notice">{{ formulaMessage }}</p>
          <label class="cube-setting-check">
            <input v-model="loopFormula" type="checkbox" />循环播放公式
          </label>
          <div class="cube-formula-actions">
            <button class="cube-primary-button" type="button" @click="prepareFormula">
              <IconPlayerPlay :size="16" aria-hidden="true" />载入演示
            </button>
            <button type="button" :disabled="!inverseFormula" @click="useInverseFormula">
              <IconRefresh :size="16" aria-hidden="true" />使用逆公式
            </button>
          </div>
        </section>

        <section v-else-if="mode === 'practice'" class="cube-practice-panel">
          <header>
            <IconKeyboard :size="20" aria-hidden="true" />
            <div>
              <h2>自由练习</h2>
              <small>拖动贴纸转层，也可点击动作或使用键盘</small>
            </div>
          </header>
          <div class="cube-practice-stats">
            <span>本轮操作</span><strong>{{ moveCount }}</strong
            ><small>步</small>
          </div>
          <div class="cube-practice-actions">
            <button
              class="cube-primary-button"
              type="button"
              :disabled="operationBusy"
              @click="randomScramble"
            >
              <IconDice5 :size="16" aria-hidden="true" />随机打乱
            </button>
            <button type="button" @click="resetPractice">
              <IconRefresh :size="16" aria-hidden="true" />重新开始
            </button>
            <button type="button" :disabled="!practicePast.length" @click="practiceUndo">
              撤销
            </button>
            <button type="button" :disabled="!practiceFuture.length" @click="practiceRedo">
              重做
            </button>
            <button type="button" :disabled="!canSolve" @click="runSolve(false)">
              <IconSparkles :size="16" aria-hidden="true" />自动还原
            </button>
          </div>
          <div class="cube-move-pad" role="group" aria-label="魔方动作">
            <button
              v-for="notation in movePad"
              :key="notation"
              type="button"
              @click="performNotation(notation)"
            >
              {{ notation }}
            </button>
          </div>
          <div class="cube-practice-hints">
            <p>鼠标：拖动贴纸转层 · 拖动空白处旋转视角</p>
            <p>键盘：R/L/U/D/F/B · Shift 反向 · ⌘/Ctrl+Z 撤销</p>
          </div>
        </section>

        <section v-else class="cube-teaching-panel">
          <header>
            <IconBook2 :size="20" aria-hidden="true" />
            <div>
              <h2>七阶段跟练</h2>
              <small>每个阶段都以真实魔方状态为检查点</small>
            </div>
          </header>
          <template v-if="solution?.mode === 'beginner'">
            <div class="cube-teaching-current">
              <span>当前阶段</span>
              <strong>{{ currentPhase?.title ?? '准备开始' }}</strong>
              <p>{{ currentPhase?.goal ?? '从第一步开始播放，跟随 3D 动作操作真实魔方。' }}</p>
              <small>{{ currentPhase?.grip ?? '保持白色中心朝上、绿色中心朝前。' }}</small>
            </div>
            <button class="cube-primary-button" type="button" @click="mobilePanel = 'steps'">
              查看完整步骤
            </button>
          </template>
          <div v-else class="cube-panel-empty">
            <IconBook2 :size="30" aria-hidden="true" />
            <h3>先录入一个魔方状态</h3>
            <p>返回真实魔方模式，通过校验后选择“新手教学”。</p>
            <button class="cube-primary-button" type="button" @click="selectMode('solve')">
              前往录入
            </button>
          </div>
        </section>

        <details class="cube-desktop-settings">
          <summary><IconSettings :size="15" aria-hidden="true" />设置与历史</summary>
          <CubeSettingsPanel
            :preferences="preferences"
            :history="history"
            @update:preferences="updatePreferences"
            @load-history="loadHistory"
            @remove-history="store.removeHistory"
            @clear-history="store.clearHistory"
          />
        </details>
      </aside>

      <div class="cube-center-panel">
        <CubeViewport
          ref="viewport"
          :facelets="facelets"
          :color-scheme="preferences.colorScheme"
          :show-labels="preferences.showFaceLabels"
          :show-move-arrows="preferences.showMoveArrows"
          :teaching-view="mode === 'beginner' && preferences.teachingView"
          :sticker-editing="mode === 'solve' && inputMethod === 'manual'"
          :layer-dragging="mode === 'practice'"
          :current-move="currentMove"
          @sticker-click="handleStickerClick"
          @move="handleViewportMove"
        />
        <CubePlaybackControls
          :cursor="playbackCursor"
          :total="totalMoves"
          :playing="isPlaying"
          :speed="preferences.animationSpeed"
          :current-move="currentMove"
          @start="seek(0)"
          @previous="previousStep"
          @toggle="togglePlayback"
          @next="nextStep"
          @end="seek(totalMoves)"
          @seek="seek"
          @update:speed="preferences.animationSpeed = $event"
        />
      </div>

      <aside class="cube-side-panel cube-side-panel--steps" aria-label="还原步骤">
        <CubeSolutionPanel
          :solution="solution"
          :cursor="playbackCursor"
          :solver-status="solverStatus"
          :message="solverMessage"
          @seek="seek"
        />
      </aside>

      <aside class="cube-mobile-settings-panel" aria-label="设置与历史">
        <CubeSettingsPanel
          :preferences="preferences"
          :history="history"
          @update:preferences="updatePreferences"
          @load-history="loadHistory"
          @remove-history="store.removeHistory"
          @clear-history="store.clearHistory"
        />
      </aside>
    </div>
  </section>
</template>
