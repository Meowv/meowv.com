/**
 * 阅读进度的写入合并器。
 *
 * 连续翻页会在每次落页时触发一次进度保存，而保存同时写 localStorage（同步）和
 * IndexedDB，频率过高会挤占主线程。这里做两件事：
 * 1. 延迟合并 —— 短时间内多次 schedule 只写一次；
 * 2. 串行化 —— 所有写入挂在同一条 Promise 链上，绝不并行。
 */
export interface ProgressSaveCoalescer {
  /** 标记有改动，延迟合并写入。 */
  schedule(): void;
  /** 立即补写一次并返回当前串行链（用于离开阅读器等必须落盘的时机）。 */
  flush(): Promise<void>;
  /** 是否还有未写入的改动。 */
  readonly pending: boolean;
}

export const DEFAULT_PROGRESS_SAVE_DELAY_MS = 500;

export function createProgressSaveCoalescer(
  write: () => Promise<void> | void,
  delayMs: number = DEFAULT_PROGRESS_SAVE_DELAY_MS,
): ProgressSaveCoalescer {
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let dirty = false;
  let chain: Promise<void> = Promise.resolve();

  const run = (): Promise<void> => {
    if (!dirty) return chain;
    dirty = false;
    // 串行链：成功或失败都继续，避免一次失败卡死后续写入。
    chain = chain.then(write, write).then(
      () => undefined,
      () => undefined,
    );
    return chain;
  };

  return {
    get pending(): boolean {
      return dirty || timer !== null;
    },
    schedule(): void {
      dirty = true;
      if (timer !== null) return;
      timer = globalThis.setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    },
    flush(): Promise<void> {
      if (timer !== null) {
        globalThis.clearTimeout(timer);
        timer = null;
      }
      return run();
    },
  };
}
