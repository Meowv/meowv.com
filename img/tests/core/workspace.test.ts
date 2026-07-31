import { createApp, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  processImage: vi.fn(),
  readImageDimensions: vi.fn(),
}));

vi.mock("@/core/image", () => ({
  getOutputFilename: (name: string, mime: string, suffix = "") =>
    `${name.replace(/\.[^.]+$/, "")}${suffix}.${mime.split("/")[1]}`,
  processImage: coreMocks.processImage,
  readImageDimensions: coreMocks.readImageDimensions,
}));

import { useImageWorkspace } from "@/composables/useImageWorkspace";
import type { RenderSpec } from "@/types/image";

let app: App<Element> | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function mountWorkspace(): ReturnType<typeof useImageWorkspace> {
  let workspace: ReturnType<typeof useImageWorkspace> | undefined;
  app = createApp({
    setup() {
      workspace = useImageWorkspace();
      return () => null;
    },
  });
  app.mount(document.createElement("div"));
  return workspace!;
}

describe("useImageWorkspace", () => {
  it("批处理并发数固定为 2，并生成可打包结果", async () => {
    const createObjectURL = vi.fn(
      (file: File) => `blob:preview-${file.name}`,
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    coreMocks.readImageDimensions.mockResolvedValue({
      width: 100,
      height: 50,
    });

    let active = 0;
    let maxActive = 0;
    coreMocks.processImage.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        blob: new Blob(["result"], { type: "image/webp" }),
        width: 80,
        height: 40,
        mime: "image/webp",
      };
    });

    const workspace = mountWorkspace();
    const files = Array.from(
      { length: 5 },
      (_, index) =>
        new File(["source"], `${index + 1}.png`, { type: "image/png" }),
    );
    const spec: RenderSpec = {
      outputSize: { width: 80, height: 40 },
      output: { mime: "image/webp", quality: 0.8 },
    };

    await workspace.addFiles(files);
    await workspace.processAll(spec, { suffix: "-small" });

    expect(maxActive).toBe(2);
    expect(workspace.completedCount.value).toBe(5);
    expect(
      workspace.tasks.value.map((task) => task.result?.filename),
    ).toEqual([
      "1-small.webp",
      "2-small.webp",
      "3-small.webp",
      "4-small.webp",
      "5-small.webp",
    ]);

    const zip = await workspace.createResultsZip();
    expect(zip.type).toBe("application/zip");

    workspace.clear();
    expect(revokeObjectURL).toHaveBeenCalledTimes(5);
  });

  it("为 ZIP 结果中的同名文件追加不区分大小写的序号", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((file: File) => `blob:preview-${file.name}`),
      revokeObjectURL: vi.fn(),
    });
    coreMocks.readImageDimensions.mockResolvedValue({
      width: 100,
      height: 50,
    });
    coreMocks.processImage.mockResolvedValue({
      blob: new Blob(["result"], { type: "image/png" }),
      width: 100,
      height: 50,
      mime: "image/png",
    });

    const workspace = mountWorkspace();
    await workspace.addFiles([
      new File(["source"], "photo.jpeg", { type: "image/jpeg" }),
      new File(["source"], "Photo.png", { type: "image/png" }),
      new File(["source"], "photo.gif", { type: "image/gif" }),
    ]);
    await workspace.processAll({
      outputSize: { width: 100, height: 50 },
      output: { mime: "image/png" },
    });

    expect(workspace.resultEntries.value.map((entry) => entry.name)).toEqual([
      "photo.png",
      "Photo-2.png",
      "photo-3.png",
    ]);
    await expect(workspace.createResultsZip()).resolves.toMatchObject({
      type: "application/zip",
    });
  });
});
