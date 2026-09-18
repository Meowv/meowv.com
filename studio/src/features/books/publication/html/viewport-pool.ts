/**
 * 离屏渲染槽位池。HtmlPageProvider 用它把「单例 DOM + 单条串行链」换成少量可复用槽位，
 * 让章节加载、清洗、排版与图片等待能并行，同时把并发上限固定住。
 *
 * 与 DOM 无关，便于在 node 环境下直接测试分配语义。
 */
export interface ViewportPoolOptions<TSlot> {
  /** 创建新槽位；只在需要并发时才会被调用（懒创建）。 */
  create: () => TSlot;
  /** 释放槽位占用的资源，dispose 时对每个已创建槽位调用一次。 */
  destroy?: (slot: TSlot) => void;
  /** 并发上限，必须大于 0。 */
  maxSize: number;
}

interface PoolWaiter<TSlot> {
  resolve: (slot: TSlot) => void;
  reject: (reason: unknown) => void;
}

function abortError(): DOMException {
  return new DOMException('电子书页面提供器已释放。', 'AbortError');
}

export class ViewportPool<TSlot> {
  readonly #options: ViewportPoolOptions<TSlot>;
  readonly #idle: TSlot[] = [];
  readonly #busy = new Set<TSlot>();
  #waiters: Array<PoolWaiter<TSlot>> = [];
  #disposed = false;

  constructor(options: ViewportPoolOptions<TSlot>) {
    if (!Number.isInteger(options.maxSize) || options.maxSize < 1) {
      throw new RangeError('ViewportPool 的 maxSize 必须是正整数。');
    }
    this.#options = options;
  }

  /** 已创建的槽位总数。 */
  get size(): number {
    return this.#idle.length + this.#busy.size;
  }

  get busyCount(): number {
    return this.#busy.size;
  }

  get waitingCount(): number {
    return this.#waiters.length;
  }

  get maxSize(): number {
    return this.#options.maxSize;
  }

  /** 取一个槽位：优先复用空闲槽位，未达上限时懒创建，否则按 FIFO 排队。 */
  acquire(signal?: AbortSignal): Promise<TSlot> {
    if (this.#disposed) return Promise.reject(abortError());
    if (signal?.aborted) return Promise.reject(abortError());
    const reusable = this.#idle.pop();
    if (reusable !== undefined) {
      this.#busy.add(reusable);
      return Promise.resolve(reusable);
    }
    if (this.size < this.#options.maxSize) {
      const slot = this.#options.create();
      this.#busy.add(slot);
      return Promise.resolve(slot);
    }
    return new Promise<TSlot>((resolve, reject) => {
      const waiter: PoolWaiter<TSlot> = {
        resolve: (slot: TSlot) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(slot);
        },
        reject: (reason: unknown) => {
          signal?.removeEventListener('abort', onAbort);
          reject(reason);
        },
      };
      const onAbort = (): void => {
        const index = this.#waiters.indexOf(waiter);
        if (index >= 0) this.#waiters.splice(index, 1);
        waiter.reject(abortError());
      };
      this.#waiters.push(waiter);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** 归还槽位：优先直接交给队首等待者，避免多一次调度。 */
  release(slot: TSlot): void {
    if (!this.#busy.delete(slot)) return;
    const waiter = this.#waiters.shift();
    if (waiter) {
      this.#busy.add(slot);
      waiter.resolve(slot);
      return;
    }
    this.#idle.push(slot);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(abortError());
    for (const slot of this.#busy) this.#options.destroy?.(slot);
    this.#busy.clear();
    for (const slot of this.#idle.splice(0)) this.#options.destroy?.(slot);
  }
}

/**
 * 章节引用计数。foliate 的 `section.unload()` 会 revoke 该章节的 blob URL，
 * 因此只有当没有任何槽位仍挂着这个章节时才能卸载，否则另一个槽位上的
 * `<img src="blob:...">` 会当场裂图。
 */
export class SectionRefCounter {
  readonly #counts = new Map<number, number>();

  count(sectionIndex: number): number {
    return this.#counts.get(sectionIndex) ?? 0;
  }

  retain(sectionIndex: number): number {
    const next = this.count(sectionIndex) + 1;
    this.#counts.set(sectionIndex, next);
    return next;
  }

  /** 释放一次引用；返回是否已经没有任何引用（true 表示可以安全卸载）。 */
  release(sectionIndex: number): boolean {
    const current = this.count(sectionIndex);
    if (current <= 1) {
      this.#counts.delete(sectionIndex);
      return true;
    }
    this.#counts.set(sectionIndex, current - 1);
    return false;
  }

  clear(): void {
    this.#counts.clear();
  }
}
