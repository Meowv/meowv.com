<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { IconRefresh } from '@tabler/icons-vue';
import type { CubeScene as CubeSceneController } from '../renderer/cube-scene';
import type { CubeColorScheme, CubeMove, Facelet, StickerRef } from '../types';

const props = withDefaults(
  defineProps<{
    facelets: readonly Facelet[];
    colorScheme: CubeColorScheme;
    showLabels: boolean;
    showMoveArrows: boolean;
    teachingView: boolean;
    stickerEditing?: boolean;
    currentMove: CubeMove | null;
  }>(),
  { stickerEditing: false },
);

const emit = defineEmits<{
  'sticker-click': [sticker: StickerRef];
  move: [move: CubeMove];
}>();

const host = ref<HTMLElement | null>(null);
const webglError = ref('');
const rendererLoading = ref(true);
let scene: CubeSceneController | null = null;
let sceneReady: Promise<void> = Promise.resolve();
let disposed = false;

function waitForSceneLoadSlot(): Promise<void> {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in globalThis) {
      globalThis.requestIdleCallback(() => resolve(), { timeout: 800 });
      return;
    }
    globalThis.setTimeout(resolve, 160);
  });
}

async function initializeScene(): Promise<void> {
  try {
    await waitForSceneLoadSlot();
    if (disposed) return;
    const { CubeScene } = await import('../renderer/cube-scene');
    const currentHost = host.value;
    if (disposed || !currentHost) return;
    scene = new CubeScene(currentHost, {
      colorScheme: props.colorScheme,
      onStickerClick: (sticker) => {
        if (props.stickerEditing) emit('sticker-click', sticker);
      },
      onMove: (move) => emit('move', move),
    });
    scene.setFacelets(props.facelets);
    scene.setTeachingView(props.teachingView);
  } catch (error) {
    webglError.value = error instanceof Error ? error.message : '当前浏览器无法创建 3D 场景。';
  } finally {
    rendererLoading.value = false;
  }
}

onMounted(() => {
  sceneReady = initializeScene();
});

watch(
  () => props.facelets,
  (facelets) => scene?.setFacelets(facelets),
);
watch(
  () => props.colorScheme,
  (scheme) => scene?.setColorScheme(scheme),
);
watch(
  () => props.teachingView,
  (enabled) => scene?.setTeachingView(enabled),
);

async function animateMove(
  move: CubeMove,
  nextFacelets: readonly Facelet[],
  duration: number,
): Promise<void> {
  await sceneReady;
  if (!scene) return;
  await scene.animateMove(move, nextFacelets, duration);
}

function resetCamera(): void {
  scene?.resetCamera();
}

function cancelAnimation(): void {
  scene?.cancelAnimation();
}

defineExpose({ animateMove, cancelAnimation });
onBeforeUnmount(() => {
  disposed = true;
  scene?.dispose();
});
</script>

<template>
  <section class="cube-viewport" aria-label="3D 魔方画布">
    <div ref="host" class="cube-viewport__host">
      <div v-if="rendererLoading" class="cube-viewport__loading" role="status">
        正在准备 3D 视图…
      </div>
      <div v-if="webglError" class="cube-viewport__fallback" role="status">
        <strong>3D 视图暂不可用</strong>
        <p>{{ webglError }}</p>
        <span>仍可通过展开图、公式按钮和步骤列表完成还原。</span>
      </div>
    </div>
    <div v-if="showLabels" class="cube-viewport__guide" role="note">
      <p><strong>当前朝向</strong><span>U 上 · F 前 · R 右</span></p>
      <p class="cube-viewport__guide-actions">
        <span>拖动空白处旋转视角</span>
        <span v-if="stickerEditing">双击贴纸即可着色</span>
      </p>
    </div>
    <div v-if="showMoveArrows && currentMove" class="cube-viewport__move-hint" aria-hidden="true">
      <strong>{{ currentMove.notation }}</strong>
      <span>{{ currentMove.amount === -1 ? '↺' : '↻' }}</span>
    </div>
    <button
      class="cube-viewport__reset"
      type="button"
      title="重置观察视角"
      aria-label="重置观察视角"
      :disabled="rendererLoading || Boolean(webglError)"
      @click="resetCamera"
    >
      <IconRefresh :size="16" aria-hidden="true" />
      <span>重置视角</span>
    </button>
  </section>
</template>
