import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerRequest, WorkerResponse } from '../types';

type TestWorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

const postMessage = vi.fn<(message: WorkerResponse) => void>();

vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({
  default: new URL('../../../../../../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url)
    .pathname,
}));

async function loadWorker(): Promise<TestWorkerScope> {
  vi.resetModules();
  const scope: TestWorkerScope = {
    onmessage: null,
    postMessage,
  };
  vi.stubGlobal('self', scope);
  await import('./sqlite.worker.ts');
  return scope;
}

async function request<T>(
  scope: TestWorkerScope,
  id: string,
  action: WorkerRequest['action'],
  payload?: unknown,
): Promise<T> {
  postMessage.mockClear();
  scope.onmessage?.({ data: { id, action, payload } } as MessageEvent<WorkerRequest>);
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
  const response = postMessage.mock.calls[0]![0];
  if (!response.ok) throw new Error(response.error);
  return response.data as T;
}

describe('sqlite worker', () => {
  beforeEach(() => {
    postMessage.mockReset();
  });

  it('通过 rowid 更新和删除没有主键的表', async () => {
    const scope = await loadWorker();

    await request(scope, 'new', 'new');
    await request(scope, 'seed', 'execute', {
      sql: 'CREATE TABLE items (name TEXT); INSERT INTO items (name) VALUES ("before");',
    });
    const page = await request<{
      rows: Array<Array<string | number | null>>;
      identityColumns: string[];
    }>(scope, 'page', 'table-page', {
      tableName: 'items',
      page: 1,
      pageSize: 20,
      search: '',
      searchColumn: '',
      sortColumn: '',
      sortDirection: 'asc',
    });

    expect(page.identityColumns).toEqual(['__studio_rowid__']);
    expect(
      await request(scope, 'update', 'update', {
        tableName: 'items',
        values: { name: 'after' },
        identity: { columns: page.identityColumns, values: [page.rows[0]![0] ?? null] },
      }),
    ).toBe(1);
    expect(
      await request(scope, 'delete', 'delete', {
        tableName: 'items',
        identity: { columns: page.identityColumns, values: [page.rows[0]![0] ?? null] },
      }),
    ).toBe(1);
  });

  it('多条 SELECT 的列结构变化时只保留最后一个结果集', async () => {
    const scope = await loadWorker();

    await request(scope, 'new', 'new');
    const result = await request<{ columns: string[]; rows: unknown[][] }>(
      scope,
      'query',
      'execute',
      {
        sql: 'SELECT 1 AS first; SELECT 2 AS second;',
      },
    );

    expect(result.columns).toEqual(['second']);
    expect(result.rows).toEqual([[2]]);
  });
});
