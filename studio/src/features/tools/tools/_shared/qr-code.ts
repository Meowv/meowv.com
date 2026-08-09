function multiply(a: number, b: number): number {
  let result = 0;
  let left = a;
  let right = b;
  while (right) {
    if (right & 1) result ^= left;
    left <<= 1;
    if (left & 0x100) left ^= 0x11d;
    right >>= 1;
  }
  return result;
}

function dataCodewords(text: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > 17) throw new Error('当前本地 QR 编码器最多支持 17 个 UTF-8 字节。');
  const bits: number[] = [0, 1, 0, 0];
  for (let bit = 7; bit >= 0; bit -= 1) bits.push((bytes.length >> bit) & 1);
  for (const byte of bytes) for (let bit = 7; bit >= 0; bit -= 1) bits.push((byte >> bit) & 1);
  for (let index = 0; index < Math.min(4, 152 - bits.length); index += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const words: number[] = [];
  for (let index = 0; index < bits.length; index += 8)
    words.push(Number.parseInt(bits.slice(index, index + 8).join(''), 2));
  for (let pad = 0; words.length < 19; pad += 1) words.push(pad % 2 ? 0x11 : 0xec);
  return words;
}

function errorCorrection(data: number[]): number[] {
  const generator = [87, 229, 146, 149, 238, 102, 21];
  const result = Array.from({ length: 7 }, () => 0);
  for (const word of data) {
    const factor = word ^ result[0];
    result.shift();
    result.push(0);
    for (let index = 0; index < result.length; index += 1)
      result[index] ^= multiply(generator[index], factor);
  }
  return result;
}

export function createQrMatrix(text: string): boolean[][] {
  if (!text) throw new Error('请输入 QR Code 内容。');
  const size = 21;
  const matrix = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const reserved = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const set = (row: number, column: number, value: boolean, reserve = true): void => {
    if (row < 0 || row >= size || column < 0 || column >= size) return;
    matrix[row][column] = value;
    if (reserve) reserved[row][column] = true;
  };
  const finder = (top: number, left: number): void => {
    for (let row = -1; row <= 7; row += 1)
      for (let column = -1; column <= 7; column += 1) {
        const inner = row >= 0 && row <= 6 && column >= 0 && column <= 6;
        const value =
          inner &&
          (row === 0 ||
            row === 6 ||
            column === 0 ||
            column === 6 ||
            (row >= 2 && row <= 4 && column >= 2 && column <= 4));
        set(top + row, left + column, value);
      }
  };
  finder(0, 0);
  finder(0, 14);
  finder(14, 0);
  for (let index = 8; index < 13; index += 1) {
    set(6, index, index % 2 === 0);
    set(index, 6, index % 2 === 0);
  }
  const format = 0x77c4;
  const formatBit = (index: number): boolean => ((format >> index) & 1) === 1;
  for (let index = 0; index <= 5; index += 1) set(index, 8, formatBit(index));
  set(7, 8, formatBit(6));
  set(8, 8, formatBit(7));
  set(8, 7, formatBit(8));
  for (let index = 9; index < 15; index += 1) set(8, 14 - index, formatBit(index));
  for (let index = 0; index < 8; index += 1) set(8, size - 1 - index, formatBit(index));
  for (let index = 8; index < 15; index += 1) set(size - 15 + index, 8, formatBit(index));
  set(size - 8, 8, true);
  const words = [...dataCodewords(text), ...errorCorrection(dataCodewords(text))];
  const bits = words.flatMap((word) =>
    Array.from({ length: 8 }, (_, index) => (word >> (7 - index)) & 1),
  );
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let offset = 0; offset < size; offset += 1) {
      const row = upward ? size - 1 - offset : offset;
      for (const column of [right, right - 1])
        if (!reserved[row][column]) {
          const raw = bits[bitIndex++] === 1;
          matrix[row][column] = raw !== ((row + column) % 2 === 0);
        }
    }
    upward = !upward;
  }
  return matrix;
}

export function qrSvg(matrix: boolean[][]): string {
  const size = matrix.length;
  const padding = 4;
  const paths = matrix
    .flatMap((row, y) =>
      row.flatMap((value, x) => (value ? [`M${x + padding} ${y + padding}h1v1h-1z`] : [])),
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + padding * 2} ${size + padding * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${paths}" fill="#000"/></svg>`;
}
