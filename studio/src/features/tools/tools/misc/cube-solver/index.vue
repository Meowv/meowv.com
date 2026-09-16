<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { IconBrandSpeedtest, IconCheck } from '@tabler/icons-vue';
import CubeNetEditor from './components/CubeNetEditor.vue';
import CubePlaybackControls from './components/CubePlaybackControls.vue';
import CubeSolutionPanel from './components/CubeSolutionPanel.vue';
import CubeViewport from './components/CubeViewport.vue';
import { applyMove, applyMoves, positionToFacelets, solvedPosition } from './core/cube';
import { describeMove, invertMove } from './core/notation';
import { CubingCubeSolver } from './solver/cubing-solver';
import { useCubeStore } from './stores/cube-store';
import type { CubeMove } from './types';
import './cube-solver.css';

type MobilePanel = 'input' | 'steps';
type ViewportExpose = {
  animateMove(
    move: CubeMove,
    nextFacelets: readonly (string | null)[],
    duration: number,
  ): Promise<void>;
  cancelAnimation(): void;
};

const store = useCubeStore();
store.initialize();
const {
  draft,
  facelets,
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
  preferences,
  generation,
  undoStack,
  redoStack,
  colorCounts,
  canAutoFill,
  currentMove,
} = storeToRefs(store);
const solver = new CubingCubeSolver();
const viewport = ref<ViewportExpose | null>(null);
const mobilePanel = ref<MobilePanel>('input');
const announcement = ref('魔方录入工作台已准备好。');
const operationBusy = ref(false);
const randomizing = ref(false);
const showValidNotice = ref(false);
let operationToken = 0;
let disposed = false;
let validNoticeTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

const totalMoves = () => solution.value?.moves.length ?? 0;
const isPlaying = () => playbackStatus.value === 'playing';
const canSolve = () => editStatus.value === 'valid' && !operationBusy.value && !randomizing.value;
const statusMessage = computed(() => {
  if (editStatus.value === 'invalid') {
    return validationIssues.value[0]?.message ?? '当前状态不合法。';
  }
  return editStatus.value === 'valid' && showValidNotice.value ? '状态合法，可以开始还原。' : '';
});

async function randomizeCube(): Promise<void> {
  if (randomizing.value || operationBusy.value) return;
  stopPlayback();
  randomizing.value = true;
  try {
    const moves = await solver.randomScramble();
    if (disposed) return;
    const position = applyMoves(solvedPosition(), moves);
    if (store.loadFacelets(positionToFacelets(position))) {
      announcement.value = `已生成 ${moves.length} 步随机打乱状态。`;
    }
  } catch (error) {
    announcement.value = error instanceof Error ? error.message : '无法生成随机状态。';
  } finally {
    randomizing.value = false;
  }
}

async function runSolve(): Promise<void> {
  if (!canSolve()) return;
  stopPlayback();
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
    const result = await solver.solve(position.value, revision);
    if (disposed || revision !== draft.value.revision || requestGeneration !== generation.value)
      return;
    store.setSolution(result);
    mobilePanel.value = 'steps';
    announcement.value = result.moves.length
      ? `已生成 ${result.moves.length} 步快速还原方案。`
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

function stopPlayback(): void {
  if (playbackStatus.value === 'playing') playbackStatus.value = 'paused';
}

function seek(cursor: number): void {
  stopPlayback();
  store.seek(cursor);
}

async function nextStep(continuePlaying = false): Promise<boolean> {
  const result = solution.value;
  if (!result || playbackCursor.value >= result.moves.length || operationBusy.value) return false;
  const move = result.moves[playbackCursor.value]!;
  const after = applyMove(position.value, move);
  const token = ++operationToken;
  operationBusy.value = true;
  try {
    await viewport.value?.animateMove(
      move,
      positionToFacelets(after),
      300 / preferences.value.animationSpeed,
    );
    if (token !== operationToken) return false;
    store.seek(playbackCursor.value + 1);
    if (continuePlaying && playbackCursor.value < result.moves.length) {
      playbackStatus.value = 'playing';
    }
    announcement.value = `${move.notation}，${describeMove(move)}`;
    return true;
  } catch {
    return false;
  } finally {
    if (token === operationToken) operationBusy.value = false;
  }
}

async function previousStep(): Promise<void> {
  if (!solution.value || playbackCursor.value <= 0 || operationBusy.value) return;
  stopPlayback();
  const move = invertMove(solution.value.moves[playbackCursor.value - 1]!);
  const after = applyMove(position.value, move);
  const token = ++operationToken;
  operationBusy.value = true;
  try {
    await viewport.value?.animateMove(
      move,
      positionToFacelets(after),
      300 / preferences.value.animationSpeed,
    );
    if (token === operationToken) store.seek(playbackCursor.value - 1);
  } catch {
    // 录入手势或页面销毁导致动画取消时保持当前游标。
  } finally {
    if (token === operationToken) operationBusy.value = false;
  }
}

async function togglePlayback(): Promise<void> {
  if (isPlaying()) {
    stopPlayback();
    return;
  }
  if (!solution.value?.moves.length) return;
  if (playbackCursor.value >= totalMoves()) store.seek(0);
  playbackStatus.value = 'playing';
  while (isPlaying() && playbackCursor.value < totalMoves()) {
    if (!(await nextStep(true))) break;
  }
  if (playbackStatus.value === 'playing') playbackStatus.value = 'completed';
}

watch(
  () => draft.value.revision,
  () => {
    operationToken += 1;
    operationBusy.value = false;
    viewport.value?.cancelAnimation();
  },
);

watch(
  editStatus,
  (status) => {
    if (validNoticeTimer !== undefined) {
      globalThis.clearTimeout(validNoticeTimer);
      validNoticeTimer = undefined;
    }
    showValidNotice.value = status === 'valid';
    if (status === 'valid') {
      validNoticeTimer = globalThis.setTimeout(() => {
        showValidNotice.value = false;
        validNoticeTimer = undefined;
      }, 2200);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  disposed = true;
  stopPlayback();
  if (validNoticeTimer !== undefined) globalThis.clearTimeout(validNoticeTimer);
  viewport.value?.cancelAnimation();
});
</script>

<template>
  <section
    class="cube-solver"
    :class="`cube-solver--mobile-${mobilePanel}`"
    aria-label="三阶魔方还原工具"
  >
    <p class="visually-hidden" aria-live="polite">{{ announcement }}</p>
    <nav class="cube-mobile-tabs" aria-label="移动端工作区面板">
      <button
        type="button"
        :class="{ 'is-active': mobilePanel === 'input' }"
        @click="mobilePanel = 'input'"
      >
        录入
      </button>
      <button
        type="button"
        :class="{ 'is-active': mobilePanel === 'steps' }"
        @click="mobilePanel = 'steps'"
      >
        步骤
      </button>
    </nav>
    <div class="cube-workbench">
      <aside class="cube-side-panel cube-side-panel--input" aria-label="魔方录入">
        <section class="cube-input-panel">
          <h2 class="visually-hidden">手动录入魔方状态</h2>
          <CubeNetEditor
            :facelets="facelets"
            :color-scheme="preferences.colorScheme"
            :selected-color="selectedColor"
            :active-face="activeFace"
            :counts="colorCounts"
            :issues="validationIssues"
            :can-auto-fill="canAutoFill"
            :can-undo="undoStack.length > 0"
            :can-redo="redoStack.length > 0"
            :randomizing="randomizing"
            @update:selected-color="selectedColor = $event"
            @update:active-face="activeFace = $event"
            @update:color-scheme="preferences.colorScheme = $event"
            @paint="store.setSticker"
            @clear="store.clearDraft"
            @auto-fill="store.autoFill"
            @randomize="randomizeCube"
            @undo="store.undo"
            @redo="store.redo"
          />
          <div class="cube-solve-actions">
            <button
              class="cube-primary-button"
              type="button"
              :disabled="!canSolve()"
              @click="runSolve"
            >
              <IconBrandSpeedtest :size="17" aria-hidden="true" />生成还原步骤
            </button>
          </div>
        </section>
      </aside>
      <div class="cube-center-panel">
        <div
          v-if="statusMessage"
          class="cube-status-banner"
          :class="`is-${editStatus}`"
          role="status"
          aria-live="polite"
        >
          <IconCheck v-if="editStatus === 'valid'" :size="16" aria-hidden="true" />
          <span>{{ statusMessage }}</span>
        </div>
        <CubeViewport
          ref="viewport"
          :facelets="facelets"
          :color-scheme="preferences.colorScheme"
          :current-move="currentMove"
        />
        <CubePlaybackControls
          :cursor="playbackCursor"
          :total="totalMoves()"
          :playing="isPlaying()"
          :speed="preferences.animationSpeed"
          :current-move="currentMove"
          @start="seek(0)"
          @previous="previousStep"
          @toggle="togglePlayback"
          @next="nextStep(false)"
          @end="seek(totalMoves())"
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
    </div>
  </section>
</template>
