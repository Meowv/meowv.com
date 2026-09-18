import { describe, expect, it } from 'vitest';
import {
  DRAG_MOTION_EPSILON,
  DRAG_VELOCITY_DECAY_MS,
  DRAG_VELOCITY_WINDOW_MS,
  MAX_DRAG_VELOCITY,
  decayDragVelocity,
  sampleDragVelocity,
  type DragVelocityState,
} from './drag-velocity';

function createState(now = 0): DragVelocityState {
  return {
    velocity: 0,
    velocitySamples: [{ progress: 0, time: now }],
    lastMotionTime: now,
    previousProgress: 0,
  };
}

describe('sampleDragVelocity', () => {
  it('只有起点样本时速度为 0，加入第二个样本后立即得出速度', () => {
    const empty: DragVelocityState = {
      velocity: 0,
      velocitySamples: [],
      lastMotionTime: 0,
      previousProgress: 0,
    };
    sampleDragVelocity(empty, 0.02, 10);
    expect(empty.velocity).toBe(0);
    expect(empty.velocitySamples).toHaveLength(1);

    // 起手时 #onPointerDown 会预置一个起点样本，因此第一次移动就能算出速度。
    const seeded = createState(0);
    sampleDragVelocity(seeded, 0.02, 10);
    expect(seeded.velocity).toBeCloseTo(2, 5);
  });

  it('按窗口首尾差除以耗时求速度', () => {
    const state = createState(0);
    sampleDragVelocity(state, 0.1, 50);
    // 0.1 进度 / 0.05s = 2 进度每秒
    expect(state.velocity).toBeCloseTo(2, 5);
  });

  it('窗口只保留最近 90ms 的样本', () => {
    const state = createState(0);
    sampleDragVelocity(state, 0.05, 30);
    sampleDragVelocity(state, 0.1, 60);
    sampleDragVelocity(state, 0.15, 90);
    expect(state.velocitySamples.at(0)?.time).toBeGreaterThan(90 - DRAG_VELOCITY_WINDOW_MS);
    expect(state.velocitySamples.at(-1)?.time).toBe(90);
  });

  it('时间窗内进度停滞时速度回落', () => {
    const state = createState(0);
    sampleDragVelocity(state, 0.2, 40);
    const fast = state.velocity;
    sampleDragVelocity(state, 0.2, 80);
    sampleDragVelocity(state, 0.2, 120);
    expect(fast).toBeGreaterThan(0);
    expect(state.velocity).toBeLessThan(fast);
    expect(state.velocity).toBeCloseTo(0, 5);
  });

  it('反向拖拽得到负速度', () => {
    const state = createState(0);
    sampleDragVelocity(state, -0.1, 50);
    expect(state.velocity).toBeCloseTo(-2, 5);
  });

  it('超过上限时被夹取', () => {
    const state = createState(0);
    sampleDragVelocity(state, 0.9, 20);
    expect(state.velocity).toBe(MAX_DRAG_VELOCITY);
    sampleDragVelocity(state, -0.9, 30);
    expect(state.velocity).toBe(-MAX_DRAG_VELOCITY);
  });

  it('两次采样过近时用 8ms 下限兜底，不会得到无穷大', () => {
    const state = createState(0);
    sampleDragVelocity(state, 0.01, 0);
    expect(Number.isFinite(state.velocity)).toBe(true);
    expect(Math.abs(state.velocity)).toBeLessThanOrEqual(MAX_DRAG_VELOCITY);
  });

  it('进度变化达到 epsilon 才刷新「最后移动时间」', () => {
    const state = createState(0);
    sampleDragVelocity(state, DRAG_MOTION_EPSILON / 2, 20);
    expect(state.lastMotionTime).toBe(0);
    sampleDragVelocity(state, DRAG_MOTION_EPSILON * 2, 40);
    expect(state.lastMotionTime).toBe(40);
  });
});

describe('decayDragVelocity', () => {
  it('刚移动过时几乎不衰减', () => {
    const state = createState(0);
    sampleDragVelocity(state, 0.1, 50);
    const before = state.velocity;
    decayDragVelocity(state, 50);
    expect(state.velocity).toBeCloseTo(before, 5);
  });

  it('静置超过衰减时长后速度归零', () => {
    const state = createState(0);
    sampleDragVelocity(state, 0.1, 50);
    decayDragVelocity(state, 50 + DRAG_VELOCITY_DECAY_MS);
    expect(state.velocity).toBe(0);
    decayDragVelocity(state, 50 + DRAG_VELOCITY_DECAY_MS * 3);
    expect(state.velocity).toBe(0);
  });

  it('衰减过程中保持符号并单调收敛', () => {
    const state = createState(0);
    sampleDragVelocity(state, 0.4, 50);
    const first = state.velocity;
    decayDragVelocity(state, 50 + DRAG_VELOCITY_DECAY_MS / 2);
    const second = state.velocity;
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
  });
});
