/**
 * 拖拽速度估计：用固定时间窗内的进度变化率估算甩动速度，供松手时决定是否提交翻页。
 * 抽成纯模块是为了让 P1-3（把视觉更新搬进 rAF）不改变采样语义时有回归保护。
 */

/** 速度采样窗口：只保留最近这段时间内的样本。 */
export const DRAG_VELOCITY_WINDOW_MS = 90;
/** 静置多久后速度衰减到 0。 */
export const DRAG_VELOCITY_DECAY_MS = 110;
/** 判定「仍在移动」的最小进度变化。 */
export const DRAG_MOTION_EPSILON = 0.0005;
/** 速度夹取上限（进度/秒）。 */
export const MAX_DRAG_VELOCITY = 4;
/** 求速度时的时间下限，避免两次采样过近导致数值爆炸。 */
const MIN_ELAPSED_MS = 8;

export interface DragVelocitySample {
  progress: number;
  time: number;
}

export interface DragVelocityState {
  velocity: number;
  velocitySamples: DragVelocitySample[];
  lastMotionTime: number;
  previousProgress: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/** 追加一次采样并重算滑动窗口速度；就地修改 state。 */
export function sampleDragVelocity(state: DragVelocityState, progress: number, now: number): void {
  if (Math.abs(progress - state.previousProgress) >= DRAG_MOTION_EPSILON) {
    state.lastMotionTime = now;
  }
  state.previousProgress = progress;
  state.velocitySamples.push({ progress, time: now });
  const cutoff = now - DRAG_VELOCITY_WINDOW_MS;
  while (state.velocitySamples.length > 1 && state.velocitySamples[0].time <= cutoff) {
    state.velocitySamples.shift();
  }
  if (state.velocitySamples.length < 2) {
    state.velocity = 0;
    return;
  }
  const first = state.velocitySamples[0];
  const elapsed = Math.max(MIN_ELAPSED_MS, now - first.time) / 1000;
  state.velocity = clamp(
    (progress - first.progress) / elapsed,
    -MAX_DRAG_VELOCITY,
    MAX_DRAG_VELOCITY,
  );
}

/** 松手时按静置时长衰减速度，避免停住一段时间后松手仍被判定为甩动。 */
export function decayDragVelocity(state: DragVelocityState, now: number): void {
  const idleProgress = clamp((now - state.lastMotionTime) / DRAG_VELOCITY_DECAY_MS, 0, 1);
  state.velocity = clamp(
    state.velocity * (1 - idleProgress),
    -MAX_DRAG_VELOCITY,
    MAX_DRAG_VELOCITY,
  );
}
