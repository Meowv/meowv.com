import { describe, expect, it, vi } from 'vitest';
import { SectionRefCounter, ViewportPool } from './viewport-pool';

describe('ViewportPool', () => {
  it('懒创建：首次 acquire 才调用 create', () => {
    const create = vi.fn(() => ({}));
    const pool = new ViewportPool({ create, maxSize: 2 });
    expect(create).not.toHaveBeenCalled();
    void pool.acquire();
    expect(create).toHaveBeenCalledTimes(1);
    expect(pool.size).toBe(1);
  });

  it('未超过上限时并发 acquire 会创建新槽位', async () => {
    const pool = new ViewportPool({ create: () => ({}), maxSize: 2 });
    const first = await pool.acquire();
    const second = await pool.acquire();
    expect(first).not.toBe(second);
    expect(pool.size).toBe(2);
    expect(pool.busyCount).toBe(2);
  });

  it('达到上限后按 FIFO 排队，release 时交给队首', async () => {
    const pool = new ViewportPool({ create: () => ({}), maxSize: 1 });
    const first = await pool.acquire();
    const secondPromise = pool.acquire();
    const thirdPromise = pool.acquire();
    expect(pool.waitingCount).toBe(2);

    pool.release(first);
    const second = await secondPromise;
    expect(second).toBe(first);
    expect(pool.waitingCount).toBe(1);

    pool.release(second);
    const third = await thirdPromise;
    expect(third).toBe(first);
    expect(pool.waitingCount).toBe(0);
  });

  it('归还后复用空闲槽位而不是新建', async () => {
    const create = vi.fn(() => ({}));
    const pool = new ViewportPool({ create, maxSize: 2 });
    const slot = await pool.acquire();
    pool.release(slot);
    expect(pool.busyCount).toBe(0);
    const again = await pool.acquire();
    expect(again).toBe(slot);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('归还非本池的槽位不产生副作用', async () => {
    const pool = new ViewportPool({ create: () => ({}), maxSize: 1 });
    const slot = await pool.acquire();
    pool.release({});
    expect(pool.busyCount).toBe(1);
    pool.release(slot);
    expect(pool.busyCount).toBe(0);
  });

  it('等待期间 signal 中止会退出队列并 reject', async () => {
    const pool = new ViewportPool({ create: () => ({}), maxSize: 1 });
    const busy = await pool.acquire();
    const controller = new AbortController();
    const waiting = pool.acquire(controller.signal);
    expect(pool.waitingCount).toBe(1);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(pool.waitingCount).toBe(0);
    pool.release(busy);
  });

  it('已中止的 signal 立即 reject，不进入队列', async () => {
    const pool = new ViewportPool({ create: () => ({}), maxSize: 1 });
    const controller = new AbortController();
    controller.abort();
    await expect(pool.acquire(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(pool.waitingCount).toBe(0);
  });

  it('dispose 会 reject 全部等待者并销毁所有槽位', async () => {
    const destroy = vi.fn();
    const pool = new ViewportPool({ create: () => ({}), destroy, maxSize: 1 });
    const busy = await pool.acquire();
    const waiting = pool.acquire();
    pool.dispose();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledWith(busy);
    await expect(pool.acquire()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('maxSize 必须是正整数', () => {
    expect(() => new ViewportPool({ create: () => ({}), maxSize: 0 })).toThrow(RangeError);
    expect(() => new ViewportPool({ create: () => ({}), maxSize: 1.5 })).toThrow(RangeError);
  });
});

describe('SectionRefCounter', () => {
  it('同一章节被两个槽位持有时不卸载', () => {
    const counter = new SectionRefCounter();
    counter.retain(3);
    counter.retain(3);
    expect(counter.count(3)).toBe(2);
    expect(counter.release(3)).toBe(false);
    expect(counter.count(3)).toBe(1);
    expect(counter.release(3)).toBe(true);
    expect(counter.count(3)).toBe(0);
  });

  it('未持有的章节 release 也返回可卸载', () => {
    const counter = new SectionRefCounter();
    expect(counter.release(7)).toBe(true);
    expect(counter.count(7)).toBe(0);
  });

  it('不同章节互不影响', () => {
    const counter = new SectionRefCounter();
    counter.retain(1);
    counter.retain(2);
    expect(counter.release(1)).toBe(true);
    expect(counter.count(2)).toBe(1);
    expect(counter.release(2)).toBe(true);
  });

  it('clear 后计数归零', () => {
    const counter = new SectionRefCounter();
    counter.retain(5);
    counter.retain(5);
    counter.clear();
    expect(counter.count(5)).toBe(0);
    expect(counter.release(5)).toBe(true);
  });
});
