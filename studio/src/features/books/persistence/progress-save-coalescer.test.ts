import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PROGRESS_SAVE_DELAY_MS,
  createProgressSaveCoalescer,
} from './progress-save-coalescer';

describe('createProgressSaveCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('连续 schedule 只触发一次写入', async () => {
    const write = vi.fn();
    const coalescer = createProgressSaveCoalescer(write);
    for (let index = 0; index < 20; index += 1) coalescer.schedule();
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEFAULT_PROGRESS_SAVE_DELAY_MS);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('写入后再 schedule 会开启新一轮合并', async () => {
    const write = vi.fn();
    const coalescer = createProgressSaveCoalescer(write, 100);
    coalescer.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(write).toHaveBeenCalledTimes(1);

    coalescer.schedule();
    coalescer.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('flush 立即写入且不等待防抖', async () => {
    const write = vi.fn();
    const coalescer = createProgressSaveCoalescer(write, 10_000);
    coalescer.schedule();
    await coalescer.flush();
    expect(write).toHaveBeenCalledTimes(1);

    // 防抖计时器已被 flush 取消，推进时间不应再写一次。
    await vi.advanceTimersByTimeAsync(20_000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('无改动时 flush 不写入', async () => {
    const write = vi.fn();
    const coalescer = createProgressSaveCoalescer(write);
    await coalescer.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it('flush 期间再次 schedule 会在后续 flush 补写', async () => {
    const write = vi.fn();
    const coalescer = createProgressSaveCoalescer(write, 10_000);
    coalescer.schedule();
    const first = coalescer.flush();
    coalescer.schedule();
    await first;
    expect(write).toHaveBeenCalledTimes(1);
    await coalescer.flush();
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('写入串行执行，绝不重叠', async () => {
    const order: string[] = [];
    let active = 0;
    let peak = 0;
    const write = (): Promise<void> =>
      new Promise<void>((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        order.push('start');
        globalThis.setTimeout(() => {
          active -= 1;
          order.push('end');
          resolve();
        }, 50);
      });
    const coalescer = createProgressSaveCoalescer(write, 10);
    coalescer.schedule();
    await vi.advanceTimersByTimeAsync(10);
    coalescer.schedule();
    await vi.advanceTimersByTimeAsync(10);
    await vi.runAllTimersAsync();
    expect(peak).toBe(1);
    expect(order).toEqual(['start', 'end', 'start', 'end']);
  });

  it('一次写入失败不会卡住后续写入', async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('存储不可用'))
      .mockResolvedValue(undefined);
    const coalescer = createProgressSaveCoalescer(write, 10);
    coalescer.schedule();
    await vi.advanceTimersByTimeAsync(10);
    coalescer.schedule();
    await vi.advanceTimersByTimeAsync(10);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('pending 反映是否还有未写入的改动', async () => {
    const coalescer = createProgressSaveCoalescer(vi.fn(), 100);
    expect(coalescer.pending).toBe(false);
    coalescer.schedule();
    expect(coalescer.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(coalescer.pending).toBe(false);
  });
});
