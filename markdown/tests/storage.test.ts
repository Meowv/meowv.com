import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPreferences,
  isWorkspaceStorageSupported,
} from "../src/services/storage";

describe("workspace storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("在 IndexedDB 不可用时返回明确错误且不降级保存文件数据", async () => {
    vi.stubGlobal("indexedDB", undefined);

    expect(isWorkspaceStorageSupported()).toBe(false);
    await expect(getPreferences()).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
  });
});
