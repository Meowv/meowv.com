/**
 * 页面渲染优先级：数值越小越先执行，与 types/reader.ts 中 PageRenderOptions.priority
 * 的文档约定一致。数值同时透传给 PageProvider，因此新增档位时应保持相对顺序。
 */
export const PAGE_RENDER_PRIORITY = {
  /** 用户正在翻动或拖拽的页面。 */
  INTERACTION: 1,
  /** 当前跨页首屏。 */
  VISIBLE: 2,
  /** 相邻跨页预热。 */
  PREFETCH: 3,
  /** 阅读质量升级。 */
  UPGRADE: 4,
  /** 缩略图等可随时放弃的后台工作。 */
  BACKGROUND: 5,
} as const;

export type PageRenderPriority = (typeof PAGE_RENDER_PRIORITY)[keyof typeof PAGE_RENDER_PRIORITY];

/** 交互让位时可以从队列尾部丢弃的最低档位。 */
export const isDroppablePriority = (priority: number): boolean =>
  priority >= PAGE_RENDER_PRIORITY.PREFETCH;

export interface PrioritizedJob {
  priority: number;
  background: boolean;
}

/**
 * 按优先级升序插入队列，同优先级保持先进先出。
 * 就地修改队列并返回插入下标。
 */
export function insertRenderJob<T extends PrioritizedJob>(queue: T[], job: T): number {
  const index = queue.findIndex((queued) => queued.priority > job.priority);
  if (index < 0) {
    queue.push(job);
    return queue.length - 1;
  }
  queue.splice(index, 0, job);
  return index;
}

/** 翻页动画期间阴影贴图的最小刷新间隔（按翻页进度计）。 */
export const SHADOW_PROGRESS_STEP = 0.08;

/** 传负数表示强制刷新并重置节奏；否则只有进度推进足够多时才重绘阴影。 */
export function shouldRefreshShadow(progress: number, lastProgress: number): boolean {
  return lastProgress < 0 || Math.abs(progress - lastProgress) >= SHADOW_PROGRESS_STEP;
}
