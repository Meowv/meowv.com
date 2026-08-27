import type {
  WallpaperBootstrapResult,
  WallpaperCategory,
  WallpaperPageResult,
  WallpaperQuery,
  WallpaperWorkerRequest,
  WallpaperWorkerResponse,
} from '../types';
import WallpapersWorker from '../workers/wallpapers.worker.ts?worker';

export class WallpaperRepository {
  private worker = new WallpapersWorker();
  private sequence = 0;
  private pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WallpaperWorkerResponse>) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      this.pending.delete(event.data.id);
      if (event.data.ok) pending.resolve(event.data.data);
      else pending.reject(new Error(event.data.error ?? '壁纸数据库查询失败。'));
    };
    this.worker.onerror = () => {
      for (const pending of this.pending.values())
        pending.reject(new Error('壁纸数据库 Worker 已停止。'));
      this.pending.clear();
    };
  }

  request<T>(action: WallpaperWorkerRequest['action'], payload?: unknown): Promise<T> {
    const id = `wallpapers-${Date.now()}-${this.sequence++}`;
    const request = () =>
      new Promise<T>((resolve, reject) => {
        if (this.disposed) {
          reject(new Error('壁纸页面已关闭。'));
          return;
        }
        this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        this.worker.postMessage({ id, action, payload } satisfies WallpaperWorkerRequest);
      });
    const result = this.queue.then(request, request);
    this.queue = result.catch(() => undefined);
    return result;
  }

  init(): Promise<void> {
    return this.request('init');
  }

  bootstrap(): Promise<WallpaperBootstrapResult> {
    return this.request('bootstrap');
  }

  categories(device: string, content: string): Promise<WallpaperCategory[]> {
    return this.request('categories', { device, content });
  }

  query(query: WallpaperQuery): Promise<WallpaperPageResult> {
    return this.request('query', query);
  }

  dispose(): void {
    this.disposed = true;
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(new Error('壁纸页面已关闭。'));
    this.pending.clear();
  }
}
