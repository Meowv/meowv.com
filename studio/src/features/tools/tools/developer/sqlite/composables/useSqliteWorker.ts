import { onBeforeUnmount } from 'vue';
import type { WorkerAction, WorkerResponse } from '../types';
import SqliteWorker from '../worker/sqlite.worker.ts?worker';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export function useSqliteWorker() {
  let worker: Worker | null = null;
  let sequence = 0;
  const pending = new Map<string, PendingRequest>();

  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new SqliteWorker();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if (response.ok) request.resolve(response.data);
      else request.reject(new Error(response.error ?? 'SQLite 操作失败。'));
    };
    worker.onerror = () => {
      for (const request of pending.values()) request.reject(new Error('SQLite Worker 意外停止。'));
      pending.clear();
    };
    return worker;
  }

  function request<T>(
    action: WorkerAction,
    payload?: unknown,
    transfer?: Transferable[],
  ): Promise<T> {
    const id = `sqlite-${Date.now()}-${sequence++}`;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      ensureWorker().postMessage({ id, action, payload }, transfer ?? []);
    });
  }

  function dispose(): void {
    worker?.terminate();
    worker = null;
    for (const request of pending.values()) request.reject(new Error('SQLite 工作区已关闭。'));
    pending.clear();
  }

  onBeforeUnmount(dispose);
  return { dispose, request };
}
