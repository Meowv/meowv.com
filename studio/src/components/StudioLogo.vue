<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

defineProps<{ compact?: boolean }>();

const logoImage = ref<HTMLImageElement | null>(null);

const SPIN_DELAY_MS = 3000;
const BASE_SPEED_DEGREES = 120;
const ACCELERATION_DEGREES_PER_SECOND = 120;
const BASE_RESET_DURATION_MS = 600;
const MAX_RESET_DURATION_MS = 900;
const MIN_RESET_BUFFER_MS = 120;
const MAX_RESET_BUFFER_MS = 420;

let hoverStartedAt = 0;
let rotation = 0;
let lastFrameAt = 0;
let currentSpeed = 0;
let activationTimer: ReturnType<typeof setTimeout> | null = null;
let animationFrame: number | null = null;
let resetAnimationFrame: number | null = null;
let resetStartedAt = 0;
let resetFrom = 0;
let resetTo: number | null = null;
let resetBufferSpeed = 0;
let resetBufferDuration = 0;
let resetDuration = 0;

function clearActivationTimer(): void {
  if (activationTimer !== null) {
    clearTimeout(activationTimer);
    activationTimer = null;
  }
}

function stopSpinning(): void {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  lastFrameAt = 0;
  currentSpeed = 0;
}

function stopResetting(): void {
  if (resetAnimationFrame !== null) {
    cancelAnimationFrame(resetAnimationFrame);
    resetAnimationFrame = null;
  }
  resetStartedAt = 0;
  resetTo = null;
}

function spin(frameAt: number): void {
  if (!hoverStartedAt || !logoImage.value) return;

  const elapsedSinceSpinStart = Math.max(0, frameAt - hoverStartedAt - SPIN_DELAY_MS);
  const elapsedSeconds = elapsedSinceSpinStart / 1000;
  const speed = BASE_SPEED_DEGREES + elapsedSeconds * ACCELERATION_DEGREES_PER_SECOND;
  currentSpeed = speed;

  if (lastFrameAt) {
    rotation += (speed * (frameAt - lastFrameAt)) / 1000;
    logoImage.value.style.setProperty('--studio-logo-rotation', `${rotation}deg`);
  }
  lastFrameAt = frameAt;
  animationFrame = requestAnimationFrame(spin);
}

function resetRotation(frameAt: number): void {
  if (!logoImage.value) return;

  if (!resetStartedAt) resetStartedAt = frameAt;
  const elapsed = frameAt - resetStartedAt;

  if (elapsed < resetBufferDuration) {
    const progress = elapsed / resetBufferDuration;
    const elapsedSeconds = elapsed / 1000;
    rotation = resetFrom + resetBufferSpeed * elapsedSeconds * (1 - progress / 2);
    logoImage.value.style.setProperty('--studio-logo-rotation', `${rotation}deg`);
    resetAnimationFrame = requestAnimationFrame(resetRotation);
    return;
  }

  if (resetTo === null) {
    const bufferSeconds = resetBufferDuration / 1000;
    resetFrom += resetBufferSpeed * bufferSeconds * 0.5;
    rotation = resetFrom;
    const currentAngle = ((rotation % 360) + 360) % 360;
    resetTo = rotation - 360 - currentAngle;
  }

  const progress = Math.min((elapsed - resetBufferDuration) / resetDuration, 1);
  const easedProgress = progress * progress * (3 - 2 * progress);
  rotation = resetFrom + (resetTo - resetFrom) * easedProgress;
  logoImage.value.style.setProperty('--studio-logo-rotation', `${rotation}deg`);

  if (progress < 1) {
    resetAnimationFrame = requestAnimationFrame(resetRotation);
    return;
  }

  resetAnimationFrame = null;
  resetStartedAt = 0;
  rotation = 0;
  logoImage.value.style.setProperty('--studio-logo-rotation', '0deg');
}

function startResetting(speed: number): void {
  if (!logoImage.value || rotation === 0) return;

  resetFrom = rotation;
  resetTo = null;
  resetBufferSpeed = speed;
  resetBufferDuration = Math.min(MAX_RESET_BUFFER_MS, Math.max(MIN_RESET_BUFFER_MS, speed / 3));
  resetDuration = Math.min(MAX_RESET_DURATION_MS, BASE_RESET_DURATION_MS + speed / 4);
  resetAnimationFrame = requestAnimationFrame(resetRotation);
}

function handlePointerEnter(): void {
  clearActivationTimer();
  stopSpinning();
  stopResetting();
  hoverStartedAt = performance.now();
  activationTimer = setTimeout(() => {
    activationTimer = null;
    animationFrame = requestAnimationFrame(spin);
  }, SPIN_DELAY_MS);
}

function handlePointerLeave(): void {
  const speedAtLeave = currentSpeed;
  clearActivationTimer();
  stopSpinning();
  hoverStartedAt = 0;
  startResetting(speedAtLeave);
}

onBeforeUnmount(() => {
  clearActivationTimer();
  stopSpinning();
  stopResetting();
});
</script>

<template>
  <RouterLink class="studio-logo" to="/" aria-label="返回 Meowv Studio 首页">
    <img
      ref="logoImage"
      src="/brand/studio.png"
      alt=""
      width="44"
      height="44"
      draggable="false"
      @pointerenter="handlePointerEnter"
      @pointerleave="handlePointerLeave"
    />
    <span v-if="!compact" class="studio-logo__wordmark home-copy__product--animated">
      <strong>Meowv</strong> Studio
    </span>
    <span class="studio-logo__leaf" aria-hidden="true">●</span>
  </RouterLink>
</template>
