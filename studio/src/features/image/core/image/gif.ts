export const MAX_GIF_FRAMES = 50;
export const MAX_GIF_SIDE = 1280;
export const MAX_GIF_TOTAL_PIXELS = 20_000_000;

export interface GifFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  delayMs?: number;
}

export interface GifAnimationOptions {
  width: number;
  height: number;
  delayMs?: number;
  /**
   * 0 表示无限循环，null 表示只播放一次，其余值表示重复次数。
   */
  loop?: number | null;
  signal?: AbortSignal;
}

class ByteWriter {
  private readonly chunks: Uint8Array[] = [];
  private pending: number[] = [];
  private byteLength = 0;

  private flushPending() {
    if (this.pending.length === 0) {
      return;
    }
    const chunk = Uint8Array.from(this.pending);
    this.chunks.push(chunk);
    this.byteLength += chunk.byteLength;
    this.pending = [];
  }

  push(...values: number[]) {
    this.pending.push(...values.map((value) => value & 0xff));
  }

  pushUint16(value: number) {
    this.push(value, value >> 8);
  }

  pushAscii(value: string) {
    for (let index = 0; index < value.length; index += 1) {
      this.push(value.charCodeAt(index));
    }
  }

  pushBytes(values: Uint8Array) {
    this.flushPending();
    this.chunks.push(values);
    this.byteLength += values.byteLength;
  }

  toUint8Array(): Uint8Array {
    this.flushPending();
    const result = new Uint8Array(this.byteLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}

class LsbBitWriter {
  private readonly bytes: number[] = [];
  private bitBuffer = 0;
  private bitCount = 0;

  write(code: number, width: number) {
    this.bitBuffer |= code << this.bitCount;
    this.bitCount += width;

    while (this.bitCount >= 8) {
      this.bytes.push(this.bitBuffer & 0xff);
      this.bitBuffer >>>= 8;
      this.bitCount -= 8;
    }
  }

  finish(): Uint8Array {
    if (this.bitCount > 0) {
      this.bytes.push(this.bitBuffer & 0xff);
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
    return Uint8Array.from(this.bytes);
  }
}

function assertInteger(value: number, label: string, minimum: number, maximum: number) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label}必须是 ${minimum}–${maximum} 之间的整数`);
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('GIF 生成已取消', 'AbortError');
  }
}

function createPalette(): Uint8Array {
  const palette = new Uint8Array(256 * 3);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = Math.round((((index >> 5) & 0x07) * 255) / 7);
    palette[index * 3 + 1] = Math.round((((index >> 2) & 0x07) * 255) / 7);
    palette[index * 3 + 2] = Math.round(((index & 0x03) * 255) / 3);
  }
  return palette;
}

function compositeChannel(channel: number, alpha: number): number {
  return Math.round((channel * alpha + 255 * (255 - alpha)) / 255);
}

function quantizeFrame(frame: GifFrame, signal?: AbortSignal): Uint8Array {
  const indices = new Uint8Array(frame.width * frame.height);

  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    if ((pixel & 0xffff) === 0) {
      throwIfAborted(signal);
    }

    const offset = pixel * 4;
    const alpha = frame.data[offset + 3] ?? 255;
    const red = compositeChannel(frame.data[offset] ?? 0, alpha);
    const green = compositeChannel(frame.data[offset + 1] ?? 0, alpha);
    const blue = compositeChannel(frame.data[offset + 2] ?? 0, alpha);
    indices[pixel] =
      (((red * 7 + 127) / 255) << 5) |
      ((((green * 7 + 127) / 255) << 2) & 0x1c) |
      (((blue * 3 + 127) / 255) & 0x03);
  }

  return indices;
}

function encodeLzw(indices: Uint8Array): Uint8Array {
  const minimumCodeSize = 8;
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  const writer = new LsbBitWriter();
  let dictionary = new Map<number, number>();
  let nextCode = endCode + 1;
  let codeSize = minimumCodeSize + 1;

  const resetDictionary = () => {
    dictionary = new Map<number, number>();
    nextCode = endCode + 1;
    codeSize = minimumCodeSize + 1;
  };

  writer.write(clearCode, codeSize);
  if (indices.length === 0) {
    writer.write(endCode, codeSize);
    return writer.finish();
  }

  let prefix = indices[0]!;
  for (let index = 1; index < indices.length; index += 1) {
    const suffix = indices[index]!;
    const key = (prefix << 8) | suffix;
    const knownCode = dictionary.get(key);

    if (knownCode !== undefined) {
      prefix = knownCode;
      continue;
    }

    writer.write(prefix, codeSize);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode);
      nextCode += 1;
      // 编码器比解码器提前一项建表，需要多越过一个边界后再增加位宽。
      if (nextCode > 1 << codeSize && codeSize < 12) {
        codeSize += 1;
      }
    } else {
      writer.write(clearCode, codeSize);
      resetDictionary();
    }
    prefix = suffix;
  }

  writer.write(prefix, codeSize);
  writer.write(endCode, codeSize);
  return writer.finish();
}

function writeSubBlocks(writer: ByteWriter, bytes: Uint8Array) {
  const blockCount = Math.ceil(bytes.length / 255);
  const blocks = new Uint8Array(bytes.length + blockCount + 1);
  let outputOffset = 0;

  for (let offset = 0; offset < bytes.length; offset += 255) {
    const block = bytes.subarray(offset, offset + 255);
    blocks[outputOffset] = block.length;
    outputOffset += 1;
    blocks.set(block, outputOffset);
    outputOffset += block.length;
  }
  blocks[outputOffset] = 0;
  writer.pushBytes(blocks);
}

function normalizeDelay(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    throw new RangeError('帧间隔必须是有效数字');
  }
  return Math.max(0, Math.min(65535, Math.round(delayMs / 10)));
}

export function encodeGifAnimation(
  frames: readonly GifFrame[],
  options: GifAnimationOptions,
): Blob {
  assertInteger(options.width, 'GIF 宽度', 1, MAX_GIF_SIDE);
  assertInteger(options.height, 'GIF 高度', 1, MAX_GIF_SIDE);
  if (frames.length === 0 || frames.length > MAX_GIF_FRAMES) {
    throw new RangeError(`GIF 帧数必须是 1–${MAX_GIF_FRAMES}`);
  }
  if (options.width * options.height * frames.length > MAX_GIF_TOTAL_PIXELS) {
    throw new RangeError(`GIF 总处理像素不能超过 ${MAX_GIF_TOTAL_PIXELS.toLocaleString('zh-CN')}`);
  }

  const loop = options.loop === undefined ? 0 : options.loop;
  if (loop !== null) {
    assertInteger(loop, '循环次数', 0, 65535);
  }

  const writer = new ByteWriter();
  writer.pushAscii('GIF89a');
  writer.pushUint16(options.width);
  writer.pushUint16(options.height);
  writer.push(0xf7, 0xff, 0);
  writer.pushBytes(createPalette());

  if (loop !== null) {
    writer.push(0x21, 0xff, 0x0b);
    writer.pushAscii('NETSCAPE2.0');
    writer.push(0x03, 0x01);
    writer.pushUint16(loop);
    writer.push(0);
  }

  for (const frame of frames) {
    throwIfAborted(options.signal);
    if (frame.width !== options.width || frame.height !== options.height) {
      throw new RangeError('每一帧的尺寸必须与 GIF 输出尺寸一致');
    }
    if (frame.data.length !== frame.width * frame.height * 4) {
      throw new RangeError('帧像素数据长度与尺寸不匹配');
    }

    const delay = normalizeDelay(frame.delayMs ?? options.delayMs ?? 500);
    writer.push(0x21, 0xf9, 0x04, 0x04);
    writer.pushUint16(delay);
    writer.push(0, 0);

    writer.push(0x2c);
    writer.pushUint16(0);
    writer.pushUint16(0);
    writer.pushUint16(options.width);
    writer.pushUint16(options.height);
    writer.push(0);

    const indices = quantizeFrame(frame, options.signal);
    const encoded = encodeLzw(indices);
    writer.push(8);
    writeSubBlocks(writer, encoded);
  }

  throwIfAborted(options.signal);
  writer.push(0x3b);
  const bytes = writer.toUint8Array();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: 'image/gif' });
}
