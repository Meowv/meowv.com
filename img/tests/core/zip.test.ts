import { describe, expect, it } from "vitest";

import { createZip } from "@/utils/zip";

const decoder = new TextDecoder();

describe("createZip", () => {
  it("创建包含 UTF-8 文件名与原始内容的标准 ZIP", async () => {
    const zip = await createZip([
      { name: "图片/一.txt", blob: new Blob(["hello"]) },
      { name: "two.bin", blob: new Blob([new Uint8Array([1, 2, 3])]) },
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(zip.type).toBe("application/zip");
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(14, true)).toBe(0x3610a686);

    const firstNameLength = view.getUint16(26, true);
    const firstExtraLength = view.getUint16(28, true);
    const firstName = decoder.decode(bytes.subarray(30, 30 + firstNameLength));
    const firstDataStart = 30 + firstNameLength + firstExtraLength;
    const firstDataSize = view.getUint32(18, true);

    expect(firstName).toBe("图片/一.txt");
    expect(
      decoder.decode(
        bytes.subarray(firstDataStart, firstDataStart + firstDataSize),
      ),
    ).toBe("hello");

    const endOffset = bytes.length - 22;
    expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(endOffset + 10, true)).toBe(2);
    const centralOffset = view.getUint32(endOffset + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
  });

  it("空数组也会生成有效的空 ZIP", async () => {
    const zip = await createZip([]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(bytes).toHaveLength(22);
    expect(view.getUint32(0, true)).toBe(0x06054b50);
    expect(view.getUint16(10, true)).toBe(0);
  });

  it("规范化相对路径，避免目录穿越", async () => {
    const zip = await createZip([
      { name: "../../safe\\image.png", blob: new Blob([]) },
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const nameLength = view.getUint16(26, true);

    expect(decoder.decode(bytes.subarray(30, 30 + nameLength))).toBe(
      "safe/image.png",
    );
  });

  it("在开始打包前响应取消信号", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      createZip([{ name: "image.png", blob: new Blob(["image"]) }], controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("读取文件流期间响应取消信号", async () => {
    const controller = new AbortController();
    let pullCount = 0;
    const streamedBlob = {
      size: 2,
      stream: () =>
        new ReadableStream<Uint8Array>({
          pull(streamController) {
            pullCount += 1;
            if (pullCount === 1) {
              streamController.enqueue(new Uint8Array([1]));
              controller.abort();
              return;
            }
            streamController.enqueue(new Uint8Array([2]));
            streamController.close();
          },
        }),
    } as Blob;

    await expect(
      createZip([{ name: "image.bin", blob: streamedBlob }], controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(pullCount).toBeGreaterThan(0);
    expect(controller.signal.aborted).toBe(true);
  });
});
