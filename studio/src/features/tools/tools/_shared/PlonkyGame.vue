<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { IconRefresh } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
interface Platform {
  x: number;
  y: number;
  width: number;
}
const canvas = ref<HTMLCanvasElement | null>(null);
const status = ref('点击场景放置平台，把小球引导到右下角目标。');
const platforms = ref<Platform[]>([]);
let animation = 0;
let last = 0;
let ball = { x: 72, y: 48, vx: 90, vy: 0, r: 11 };
function reset(): void {
  ball = { x: 72, y: 48, vx: 90, vy: 0, r: 11 };
  platforms.value = [];
  status.value = '点击场景放置平台，把小球引导到右下角目标。';
}
function place(event: MouseEvent): void {
  if (!canvas.value || platforms.value.length >= 4) return;
  const rect = canvas.value.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * 640) / rect.width;
  const y = ((event.clientY - rect.top) * 400) / rect.height;
  platforms.value = [...platforms.value, { x: Math.max(0, Math.min(520, x - 60)), y, width: 120 }];
}
function update(time: number): void {
  const element = canvas.value;
  const context = element?.getContext('2d');
  if (!element || !context) {
    animation = requestAnimationFrame(update);
    return;
  }
  const delta = Math.min(0.032, (time - last) / 1000 || 0);
  last = time;
  ball.vy += 430 * delta;
  ball.x += ball.vx * delta;
  ball.y += ball.vy * delta;
  if (ball.x < ball.r || ball.x > 640 - ball.r) {
    ball.vx *= -0.86;
    ball.x = Math.max(ball.r, Math.min(640 - ball.r, ball.x));
  }
  for (const platform of platforms.value) {
    if (
      ball.vy > 0 &&
      ball.x + ball.r > platform.x &&
      ball.x - ball.r < platform.x + platform.width &&
      ball.y + ball.r >= platform.y &&
      ball.y + ball.r - ball.vy * delta < platform.y + 5
    ) {
      ball.y = platform.y - ball.r;
      ball.vy *= -0.72;
    }
  }
  if (ball.y > 400 + ball.r) {
    status.value = '小球掉出场景，已重新开始。';
    ball = { x: 72, y: 48, vx: 90, vy: 0, r: 11 };
  }
  if (ball.x > 530 && ball.x < 610 && ball.y > 326) {
    status.value = '过关！点击重置可以再玩一次。';
    ball.vx = 0;
    ball.vy = 0;
    ball.y = 350;
  }
  context.clearRect(0, 0, 640, 400);
  const gradient = context.createLinearGradient(0, 0, 640, 400);
  gradient.addColorStop(0, '#eef2ff');
  gradient.addColorStop(1, '#dbeafe');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 640, 400);
  context.fillStyle = '#16a34a';
  context.fillRect(530, 342, 80, 44);
  context.fillStyle = '#fff';
  context.font = 'bold 14px system-ui';
  context.fillText('GOAL', 547, 369);
  context.fillStyle = '#7c3aed';
  for (const p of platforms.value) context.fillRect(p.x, p.y, p.width, 8);
  context.beginPath();
  context.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  context.fillStyle = '#f97316';
  context.fill();
  context.strokeStyle = '#c2410c';
  context.lineWidth = 2;
  context.stroke();
  animation = requestAnimationFrame(update);
}
onMounted(() => {
  animation = requestAnimationFrame(update);
});
onBeforeUnmount(() => cancelAnimationFrame(animation));
</script>
<template>
  <ToolSection title="Plonky" description="放置最多 4 块平台，用重力与反弹把小球送入目标。"
    ><div class="tool-stack">
      <canvas
        ref="canvas"
        class="tool-game-canvas"
        width="640"
        height="400"
        aria-label="Plonky 游戏场景"
        @click="place"
      ></canvas>
      <p class="tool-status">{{ status }} 已放置 {{ platforms.length }}/4。</p>
      <ToolActions
        ><button type="button" class="tool-button tool-button--primary" @click="reset">
          <IconRefresh :size="16" />重置关卡
        </button></ToolActions
      >
    </div></ToolSection
  ><ToolHelp
    :steps="['观察小球运动方向。', '点击场景放置水平平台。', '利用反弹把球送入绿色目标。']"
    note="游戏使用 requestAnimationFrame 和简化刚体碰撞，离开页面会停止动画。"
  />
</template>
