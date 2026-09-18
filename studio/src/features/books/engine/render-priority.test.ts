import { describe, expect, it } from 'vitest';
import {
  PAGE_RENDER_PRIORITY,
  SHADOW_PROGRESS_STEP,
  insertRenderJob,
  isDroppablePriority,
  shouldRefreshShadow,
  type PrioritizedJob,
} from './render-priority';

interface FakeJob extends PrioritizedJob {
  label: string;
}

function job(label: string, priority: number): FakeJob {
  return { label, priority, background: isDroppablePriority(priority) };
}

function labels(queue: readonly PrioritizedJob[]): string[] {
  return queue.map((entry) => (entry as FakeJob).label);
}

describe('PAGE_RENDER_PRIORITY', () => {
  it('数值越小越优先，且档位顺序固定', () => {
    expect(PAGE_RENDER_PRIORITY.INTERACTION).toBeLessThan(PAGE_RENDER_PRIORITY.VISIBLE);
    expect(PAGE_RENDER_PRIORITY.VISIBLE).toBeLessThan(PAGE_RENDER_PRIORITY.PREFETCH);
    expect(PAGE_RENDER_PRIORITY.PREFETCH).toBeLessThan(PAGE_RENDER_PRIORITY.UPGRADE);
    expect(PAGE_RENDER_PRIORITY.UPGRADE).toBeLessThan(PAGE_RENDER_PRIORITY.BACKGROUND);
  });

  it('交互与首屏不可丢弃，预热及以上可丢弃', () => {
    expect(isDroppablePriority(PAGE_RENDER_PRIORITY.INTERACTION)).toBe(false);
    expect(isDroppablePriority(PAGE_RENDER_PRIORITY.VISIBLE)).toBe(false);
    expect(isDroppablePriority(PAGE_RENDER_PRIORITY.PREFETCH)).toBe(true);
    expect(isDroppablePriority(PAGE_RENDER_PRIORITY.UPGRADE)).toBe(true);
    expect(isDroppablePriority(PAGE_RENDER_PRIORITY.BACKGROUND)).toBe(true);
  });
});

describe('insertRenderJob', () => {
  it('按优先级升序出队，交互页排在预热之前', () => {
    const queue: FakeJob[] = [];
    insertRenderJob(queue, job('prefetch', PAGE_RENDER_PRIORITY.PREFETCH));
    insertRenderJob(queue, job('upgrade', PAGE_RENDER_PRIORITY.UPGRADE));
    insertRenderJob(queue, job('interaction', PAGE_RENDER_PRIORITY.INTERACTION));
    expect(labels(queue)).toEqual(['interaction', 'prefetch', 'upgrade']);
  });

  it('同优先级追加到队尾，保持先进先出', () => {
    const queue: FakeJob[] = [];
    insertRenderJob(queue, job('a', PAGE_RENDER_PRIORITY.PREFETCH));
    insertRenderJob(queue, job('b', PAGE_RENDER_PRIORITY.PREFETCH));
    insertRenderJob(queue, job('c', PAGE_RENDER_PRIORITY.PREFETCH));
    expect(labels(queue)).toEqual(['a', 'b', 'c']);
  });

  it('返回插入下标，更高优先级插到队首', () => {
    const queue: FakeJob[] = [job('first', PAGE_RENDER_PRIORITY.INTERACTION)];
    expect(insertRenderJob(queue, job('second', PAGE_RENDER_PRIORITY.INTERACTION))).toBe(1);
    expect(insertRenderJob(queue, job('third', PAGE_RENDER_PRIORITY.INTERACTION))).toBe(2);
    expect(labels(queue)).toEqual(['first', 'second', 'third']);
    expect(insertRenderJob(queue, job('urgent', PAGE_RENDER_PRIORITY.INTERACTION - 1))).toBe(0);
    expect(labels(queue)).toEqual(['urgent', 'first', 'second', 'third']);
  });

  it('摘掉可丢弃任务后，不可丢弃任务的相对顺序不变', () => {
    const queue: FakeJob[] = [];
    insertRenderJob(queue, job('interaction', PAGE_RENDER_PRIORITY.INTERACTION));
    insertRenderJob(queue, job('prefetch-1', PAGE_RENDER_PRIORITY.PREFETCH));
    insertRenderJob(queue, job('prefetch-2', PAGE_RENDER_PRIORITY.PREFETCH));
    insertRenderJob(queue, job('upgrade', PAGE_RENDER_PRIORITY.UPGRADE));
    insertRenderJob(queue, job('background', PAGE_RENDER_PRIORITY.BACKGROUND));

    expect(labels(queue)).toEqual([
      'interaction',
      'prefetch-1',
      'prefetch-2',
      'upgrade',
      'background',
    ]);
    expect(labels(queue.filter((entry) => !entry.background))).toEqual(['interaction']);
  });
});

describe('shouldRefreshShadow', () => {
  it('0→1 的均匀推进上刷新次数落在 ~13 附近，远低于逐帧', () => {
    let last = -1;
    let refreshes = 0;
    for (let step = 0; step <= 50; step += 1) {
      const progress = step / 50;
      if (shouldRefreshShadow(progress, last)) {
        refreshes += 1;
        last = progress;
      }
    }
    // 浮点误差可能让相邻档位提前或延后一帧，因此只断言量级。
    expect(refreshes).toBeGreaterThanOrEqual(11);
    expect(refreshes).toBeLessThanOrEqual(14);
    expect(refreshes).toBeLessThanOrEqual(Math.ceil(1 / SHADOW_PROGRESS_STEP) + 1);
    expect(refreshes).toBeLessThan(43);
  });

  it('进度大幅回退同样触发刷新，不会漏掉反向动画', () => {
    expect(shouldRefreshShadow(0.3, 0.44)).toBe(true);
    expect(shouldRefreshShadow(0.44, 0.4)).toBe(false);
  });

  it('重置标记（负数）后第一次必定刷新', () => {
    expect(shouldRefreshShadow(0.5, -1)).toBe(true);
    expect(shouldRefreshShadow(0, -1)).toBe(true);
  });

  it('微小推进不刷新，超过步长才刷新', () => {
    expect(SHADOW_PROGRESS_STEP).toBe(0.08);
    expect(shouldRefreshShadow(0.5, 0.5)).toBe(false);
    expect(shouldRefreshShadow(0.55, 0.5)).toBe(false);
    expect(shouldRefreshShadow(0.59, 0.5)).toBe(true);
  });
});
