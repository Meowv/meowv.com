import { afterEach, describe, expect, it, vi } from 'vitest';
import { newPlanDocument } from './files';
import type { PlanDocument } from './types';

// 控制 request 与事务完成的时序，验证磁盘提交和冲突处理的边界。
function databaseHarness(existing?: PlanDocument) {
  let stored = existing;
  let pending: PlanDocument | undefined;
  const getRequest = { result: existing, onsuccess: null as (() => void) | null };
  const tx = {
    error: null as Error | null,
    oncomplete: null as (() => void) | null,
    onabort: null as (() => void) | null,
    onerror: null as (() => void) | null,
    abort() {
      queueMicrotask(() => tx.onabort?.());
    },
    objectStore: () => ({
      get: () => {
        queueMicrotask(() => getRequest.onsuccess?.());
        return getRequest;
      },
      put: (doc: PlanDocument) => {
        pending = doc;
      },
    }),
  };
  const db = { transaction: () => tx, close: vi.fn() };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = { result: db, onsuccess: null as (() => void) | null };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return {
    tx,
    value: () => stored,
    pending: () => pending,
    commit: () => {
      stored = pending;
      tx.oncomplete?.();
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('户型方案本地存储', () => {
  it('仅事务完成后报告保存成功并递增版本', async () => {
    const doc = newPlanDocument();
    const harness = databaseHarness();
    const { saveDocument } = await import('./storage');
    let resolved = false;
    const saving = saveDocument(doc, null).then((value) => {
      resolved = true;
      return value;
    });
    await vi.waitFor(() => expect(harness.pending()).toBeDefined());
    expect(resolved).toBe(false);
    expect(harness.value()).toBeUndefined();
    harness.commit();
    expect((await saving).revision).toBe(1);
    expect(doc.revision).toBe(0);
  });
  it('旧版本不能覆盖另一窗口保存的新版本', async () => {
    const doc = { ...newPlanDocument(), revision: 3 };
    const harness = databaseHarness(doc);
    const { saveDocument, PlanConflictError } = await import('./storage');
    await expect(saveDocument({ ...doc, title: '过期修改' }, 2)).rejects.toBeInstanceOf(
      PlanConflictError,
    );
    expect(harness.pending()).toBeUndefined();
    expect(harness.value()?.title).toBe(doc.title);
  });
  it('被删除的文档不能由过期窗口重新创建', async () => {
    databaseHarness();
    const { saveDocument, PlanConflictError } = await import('./storage');
    await expect(saveDocument(newPlanDocument(), 1)).rejects.toBeInstanceOf(PlanConflictError);
  });
  it('存储失败不会宣称已保存', async () => {
    const harness = databaseHarness();
    const { saveDocument } = await import('./storage');
    const saving = saveDocument(newPlanDocument(), null);
    const rejection = expect(saving).rejects.toThrow('本地保存失败');
    await vi.waitFor(() => expect(harness.pending()).toBeDefined());
    harness.tx.error = new Error('QuotaExceededError');
    harness.tx.abort();
    await rejection;
    expect(harness.value()).toBeUndefined();
  });
});
