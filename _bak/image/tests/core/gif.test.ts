import { describe, expect, it } from "vitest";

import {
  encodeGifAnimation,
  MAX_GIF_FRAMES,
  MAX_GIF_SIDE,
} from "@/core/image/gif";

function frame(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

function readSubBlocks(bytes: Uint8Array, start: number) {
  const chunks: number[] = [];
  let offset = start;
  while (bytes[offset] !== 0) {
    const length = bytes[offset]!;
    offset += 1;
    chunks.push(...bytes.subarray(offset, offset + length));
    offset += length;
  }
  return { data: Uint8Array.from(chunks), nextOffset: offset + 1 };
}

function decodeLzw(data: Uint8Array, minimumCodeSize: number): Uint8Array {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let dictionary: number[][] = [];
  let nextCode = endCode + 1;
  let codeSize = minimumCodeSize + 1;
  let bitOffset = 0;
  let previous: number[] | null = null;
  const output: number[] = [];

  const reset = () => {
    dictionary = Array.from({ length: clearCode }, (_, index) => [index]);
    nextCode = endCode + 1;
    codeSize = minimumCodeSize + 1;
    previous = null;
  };
  const readCode = () => {
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      const byte = data[bitOffset >> 3] ?? 0;
      code |= ((byte >> (bitOffset & 7)) & 1) << bit;
      bitOffset += 1;
    }
    return code;
  };

  reset();
  while (bitOffset + codeSize <= data.length * 8) {
    const code = readCode();
    if (code === clearCode) {
      reset();
      continue;
    }
    if (code === endCode) {
      break;
    }

    let entry = dictionary[code];
    if (!entry && previous && code === nextCode) {
      entry = [...previous, previous[0]!];
    }
    if (!entry) {
      throw new Error(`无效 LZW 代码：${code}`);
    }

    output.push(...entry);
    if (previous && nextCode < 4096) {
      dictionary[nextCode] = [...previous, entry[0]!];
      nextCode += 1;
      if (nextCode === 1 << codeSize && codeSize < 12) {
        codeSize += 1;
      }
    }
    previous = entry;
  }

  return Uint8Array.from(output);
}

function parseFrames(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames: Array<{ delay: number; indices: Uint8Array }> = [];
  let offset = 13 + 256 * 3;
  let delay = 0;

  while (offset < bytes.length) {
    const marker = bytes[offset++]!;
    if (marker === 0x3b) {
      break;
    }
    if (marker === 0x21) {
      const label = bytes[offset++]!;
      if (label === 0xf9) {
        expect(bytes[offset++]).toBe(4);
        offset += 1;
        delay = view.getUint16(offset, true);
        offset += 2;
        offset += 2;
      } else {
        const blocks = readSubBlocks(bytes, offset);
        offset = blocks.nextOffset;
      }
      continue;
    }
    if (marker !== 0x2c) {
      throw new Error(`未知 GIF 块：${marker}`);
    }

    offset += 9;
    const minimumCodeSize = bytes[offset++]!;
    const blocks = readSubBlocks(bytes, offset);
    frames.push({
      delay,
      indices: decodeLzw(blocks.data, minimumCodeSize),
    });
    offset = blocks.nextOffset;
  }

  return frames;
}

describe("encodeGifAnimation", () => {
  it("生成包含循环信息、帧间隔和多帧像素的 GIF89a", async () => {
    const red = frame(2, 1, () => [255, 0, 0, 255]);
    const green = frame(2, 1, () => [0, 255, 0, 255]);
    const blob = encodeGifAnimation(
      [
        { ...red, delayMs: 100 },
        { ...green, delayMs: 250 },
      ],
      { width: 2, height: 1, loop: 0 },
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes);
    const frames = parseFrames(bytes);

    expect(blob.type).toBe("image/gif");
    expect(text.slice(0, 6)).toBe("GIF89a");
    expect(text).toContain("NETSCAPE2.0");
    expect(bytes.at(-1)).toBe(0x3b);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({
      delay: 10,
      indices: new Uint8Array([224, 224]),
    });
    expect(frames[1]).toEqual({
      delay: 25,
      indices: new Uint8Array([28, 28]),
    });
  });

  it("跨越 LZW 位宽和字典重置边界后仍可完整解码", async () => {
    const width = 128;
    const height = 128;
    const gradient = frame(width, height, (x, y) => [
      (x * 17 + y * 3) % 256,
      (x * 5 + y * 19) % 256,
      (x * 13 + y * 11) % 256,
      255,
    ]);
    const bytes = new Uint8Array(
      await encodeGifAnimation([gradient], {
        width,
        height,
        loop: null,
      }).arrayBuffer(),
    );
    const frames = parseFrames(bytes);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.indices).toHaveLength(width * height);
  });

  it("单次播放时不写入循环扩展", async () => {
    const still = frame(1, 1, () => [0, 0, 0, 255]);
    const bytes = new Uint8Array(
      await encodeGifAnimation([still], {
        width: 1,
        height: 1,
        loop: null,
      }).arrayBuffer(),
    );

    expect(new TextDecoder("latin1").decode(bytes)).not.toContain(
      "NETSCAPE2.0",
    );
  });

  it("写入指定的 Netscape 重复次数", async () => {
    const still = frame(1, 1, () => [0, 0, 0, 255]);
    const bytes = new Uint8Array(
      await encodeGifAnimation([still], {
        width: 1,
        height: 1,
        loop: 4,
      }).arrayBuffer(),
    );
    const text = new TextDecoder("latin1").decode(bytes);
    const identifierOffset = text.indexOf("NETSCAPE2.0");

    expect(identifierOffset).toBeGreaterThan(0);
    expect(bytes[identifierOffset + 11]).toBe(3);
    expect(bytes[identifierOffset + 12]).toBe(1);
    expect(
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
        identifierOffset + 13,
        true,
      ),
    ).toBe(4);
  });

  it("拒绝超限尺寸、帧数和错误像素长度", () => {
    const still = frame(1, 1, () => [0, 0, 0, 255]);
    expect(() =>
      encodeGifAnimation([still], {
        width: MAX_GIF_SIDE + 1,
        height: 1,
      }),
    ).toThrow("GIF 宽度");
    expect(() =>
      encodeGifAnimation(
        Array.from({ length: MAX_GIF_FRAMES + 1 }, () => still),
        { width: 1, height: 1 },
      ),
    ).toThrow("GIF 帧数");
    expect(() =>
      encodeGifAnimation(
        [
          {
            data: new Uint8ClampedArray(3),
            width: 1,
            height: 1,
          },
        ],
        { width: 1, height: 1 },
      ),
    ).toThrow("像素数据长度");
  });
});
