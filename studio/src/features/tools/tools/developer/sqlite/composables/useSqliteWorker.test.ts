import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerRequest, WorkerResponse } from '../types';

const { FakeWorker } = vi.hoisted(() => {
  class FakeWorker {
    static instances: FakeWorker[] = [];

    onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    readonly postMessage = vi.fn<(message: WorkerRequest, transfer?: Transferable[]) => void>();
    readonly terminate = vi.fn();

    constructor() {
      FakeWorker.instances.push(this);
    }
  }

  return { FakeWorker };
});

vi.mock('../worker/sqlite.worker.ts?worker', () => ({ default: FakeWorker }));

import { useSqliteWorker } from './useSqliteWorker';

afterEach(() => {
  FakeWorker.instances.length = 0;
  vi.clearAllMocks();
});

describe('useSqliteWorker', () => {
  it('Worker 出错后下一次请求会创建新的 Worker', async () => {
    const { request } = useSqliteWorker();
    const failedRequest = request('init');
    const failedWorker = FakeWorker.instances[0]!;

    failedWorker.onerror?.();

    await expect(failedRequest).rejects.toThrow('SQLite Worker 意外停止。');
    expect(failedWorker.terminate).toHaveBeenCalledOnce();

    const recoveredRequest = request<boolean>('init');
    const recoveredWorker = FakeWorker.instances[1]!;
    const message = recoveredWorker.postMessage.mock.calls[0]![0];

    recoveredWorker.onmessage?.({
      data: { id: message.id, ok: true, data: true },
    } as MessageEvent<WorkerResponse>);

    await expect(recoveredRequest).resolves.toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
  });
});
