<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { IconCamera, IconRefresh, IconShieldLock } from '@tabler/icons-vue';
import { CameraSession } from '../scanner/camera-session';
import { classifyScannedStickers } from '../scanner/color';
import { mapCameraSamples } from '../scanner/orientation';
import type { Face, ScanClassification, ScannedSticker } from '../types';

const emit = defineEmits<{
  complete: [classification: ScanClassification];
  fallback: [message: string];
}>();

const sequence: Array<{ face: Face; title: string; instruction: string }> = [
  { face: 'F', title: '前面 F', instruction: '白色中心朝上，绿色中心朝向镜头。' },
  { face: 'R', title: '右面 R', instruction: '保持白色朝上，将魔方整体向左转 90°。' },
  { face: 'B', title: '后面 B', instruction: '继续同方向转动，让蓝色中心朝向镜头。' },
  { face: 'L', title: '左面 L', instruction: '继续同方向转动，让橙色中心朝向镜头。' },
  { face: 'U', title: '上面 U', instruction: '恢复绿色朝前，再将白色面朝向镜头。' },
  { face: 'D', title: '下面 D', instruction: '保持绿色方向，将黄色面朝向镜头。' },
];

const video = ref<HTMLVideoElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const active = ref(false);
const capturing = ref(false);
const step = ref(0);
const message = ref('相机只在当前浏览器中取色，不会保存或上传画面。');
const samples = ref<ScannedSticker[]>([]);
const session = new CameraSession();
const current = computed(() => sequence[step.value] ?? sequence.at(-1)!);

async function start(): Promise<void> {
  active.value = true;
  message.value = '正在请求相机权限…';
  await nextTick();
  if (!video.value) return;
  try {
    await session.start(video.value);
    message.value = current.value.instruction;
  } catch (error) {
    session.stop();
    if (video.value) video.value.srcObject = null;
    active.value = false;
    const name = error instanceof DOMException ? error.name : '';
    message.value =
      name === 'NotAllowedError'
        ? '未获得相机权限，已切换到手动录入。'
        : name === 'NotFoundError'
          ? '没有检测到可用相机，已切换到手动录入。'
          : error instanceof Error
            ? error.message
            : '无法打开相机，已切换到手动录入。';
    emit('fallback', message.value);
  }
}

async function capture(): Promise<void> {
  if (!video.value || !canvas.value || capturing.value) return;
  capturing.value = true;
  message.value = `正在采集${current.value.title}…`;
  try {
    const colors = await session.capture(video.value, canvas.value);
    const face = current.value.face;
    samples.value = [
      ...samples.value.filter((item) => item.face !== face),
      ...mapCameraSamples(face, colors),
    ];
    if (step.value < sequence.length - 1) {
      step.value += 1;
      message.value = current.value.instruction;
    } else {
      const result = classifyScannedStickers(samples.value);
      emit('complete', result);
      message.value = result.lowConfidence.length
        ? `扫描完成，${result.lowConfidence.length} 个贴纸需要手动复核。`
        : '扫描完成，颜色识别结果已通过初步检查。';
      stop(false);
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : '采集失败，请保持魔方稳定后重试。';
  } finally {
    capturing.value = false;
  }
}

function restart(): void {
  step.value = 0;
  samples.value = [];
  message.value = sequence[0].instruction;
}

function stop(reset = true): void {
  session.stop();
  if (video.value) video.value.srcObject = null;
  active.value = false;
  if (reset) restart();
}

onBeforeUnmount(() => stop());
</script>

<template>
  <div class="cube-scanner">
    <div v-if="!active" class="cube-scanner__intro">
      <IconShieldLock :size="28" aria-hidden="true" />
      <strong>逐面扫描，仅在本地取色</strong>
      <p>{{ message }}</p>
      <button class="cube-primary-button" type="button" @click="start">
        <IconCamera :size="17" aria-hidden="true" />打开相机
      </button>
    </div>

    <template v-else>
      <div class="cube-scanner__video">
        <video ref="video" playsinline muted aria-label="相机扫描预览"></video>
        <div class="cube-scanner__grid" aria-hidden="true">
          <span v-for="index in 9" :key="index"></span>
        </div>
        <span class="cube-scanner__step">{{ step + 1 }} / 6 · {{ current.title }}</span>
      </div>
      <p class="cube-scanner__instruction">{{ message }}</p>
      <div class="cube-scanner__actions">
        <button type="button" @click="stop()">取消</button>
        <button type="button" @click="restart">
          <IconRefresh :size="15" aria-hidden="true" />重新开始
        </button>
        <button class="cube-primary-button" type="button" :disabled="capturing" @click="capture">
          <IconCamera :size="16" aria-hidden="true" />{{
            capturing ? '采集中…' : `采集${current.title}`
          }}
        </button>
      </div>
    </template>
    <canvas ref="canvas" hidden></canvas>
  </div>
</template>
