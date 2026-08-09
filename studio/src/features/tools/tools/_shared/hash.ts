export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA3-256' | 'SHA-256' | 'SHA-512';

function add32(a: number, b: number): number {
  return (a + b) & 0xffffffff;
}

function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
  a = add32(add32(a, q), add32(x, t));
  return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn((b & c) | (~b & d), a, b, x, s, t);
}

function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}

function md5Block(bytes: Uint8Array): number[] {
  const length = bytes.length;
  const paddedLength = (((length + 8) >>> 6) + 1) * 16;
  const words = new Array<number>(paddedLength).fill(0);
  for (let index = 0; index < length; index += 1) {
    words[index >> 2] |= bytes[index] << ((index % 4) * 8);
  }
  words[length >> 2] |= 0x80 << ((length % 4) * 8);
  words[paddedLength - 2] = (length * 8) & 0xffffffff;
  words[paddedLength - 1] = Math.floor((length * 8) / 0x100000000);
  return words;
}

function hex32(value: number): string {
  let result = '';
  for (let index = 0; index < 4; index += 1) {
    result += ((value >>> (index * 8)) & 0xff).toString(16).padStart(2, '0');
  }
  return result;
}

export function md5Bytes(bytes: Uint8Array): string {
  const words = md5Block(bytes);
  let a = 0x67452301;
  let b = -0x10325477;
  let c = -0x67452302;
  let d = 0x10325476;

  for (let index = 0; index < words.length; index += 16) {
    const oldA = a;
    const oldB = b;
    const oldC = c;
    const oldD = d;

    a = ff(a, b, c, d, words[index], 7, -0x28955b88);
    d = ff(d, a, b, c, words[index + 1], 12, -0x173848aa);
    c = ff(c, d, a, b, words[index + 2], 17, 0x242070db);
    b = ff(b, c, d, a, words[index + 3], 22, -0x3e423112);
    a = ff(a, b, c, d, words[index + 4], 7, -0x0a83f051);
    d = ff(d, a, b, c, words[index + 5], 12, 0x4787c62a);
    c = ff(c, d, a, b, words[index + 6], 17, -0x57cfb9ed);
    b = ff(b, c, d, a, words[index + 7], 22, -0x02b96aff);
    a = ff(a, b, c, d, words[index + 8], 7, 0x698098d8);
    d = ff(d, a, b, c, words[index + 9], 12, -0x74bb0851);
    c = ff(c, d, a, b, words[index + 10], 17, -0x0000a44f);
    b = ff(b, c, d, a, words[index + 11], 22, -0x76a32842);
    a = ff(a, b, c, d, words[index + 12], 7, 0x6b901122);
    d = ff(d, a, b, c, words[index + 13], 12, -0x02678e6d);
    c = ff(c, d, a, b, words[index + 14], 17, -0x5986bc72);
    b = ff(b, c, d, a, words[index + 15], 22, 0x49b40821);

    a = gg(a, b, c, d, words[index + 1], 5, -0x09e1da9e);
    d = gg(d, a, b, c, words[index + 6], 9, -0x3fbf4cc0);
    c = gg(c, d, a, b, words[index + 11], 14, 0x265e5a51);
    b = gg(b, c, d, a, words[index], 20, -0x16493856);
    a = gg(a, b, c, d, words[index + 5], 5, -0x29d0efa3);
    d = gg(d, a, b, c, words[index + 10], 9, 0x02441453);
    c = gg(c, d, a, b, words[index + 15], 14, -0x275e197f);
    b = gg(b, c, d, a, words[index + 4], 20, -0x182c0438);
    a = gg(a, b, c, d, words[index + 9], 5, 0x21e1cde6);
    d = gg(d, a, b, c, words[index + 14], 9, -0x3cc8f82a);
    c = gg(c, d, a, b, words[index + 3], 14, -0x0b2af279);
    b = gg(b, c, d, a, words[index + 8], 20, 0x455a14ed);
    a = gg(a, b, c, d, words[index + 13], 5, -0x561c16fb);
    d = gg(d, a, b, c, words[index + 2], 9, -0x03105c08);
    c = gg(c, d, a, b, words[index + 7], 14, 0x676f02d9);
    b = gg(b, c, d, a, words[index + 12], 20, -0x72d5b376);

    a = hh(a, b, c, d, words[index + 5], 4, -0x0005c6be);
    d = hh(d, a, b, c, words[index + 8], 11, -0x788e097f);
    c = hh(c, d, a, b, words[index + 11], 16, 0x6d9d6122);
    b = hh(b, c, d, a, words[index + 14], 23, -0x021ac7f4);
    a = hh(a, b, c, d, words[index + 1], 4, -0x5b4115bc);
    d = hh(d, a, b, c, words[index + 4], 11, 0x4bdecfa9);
    c = hh(c, d, a, b, words[index + 7], 16, -0x0944b4a0);
    b = hh(b, c, d, a, words[index + 10], 23, -0x41404390);
    a = hh(a, b, c, d, words[index + 13], 4, 0x289b7ec6);
    d = hh(d, a, b, c, words[index], 11, -0x155ed806);
    c = hh(c, d, a, b, words[index + 3], 16, -0x2b10cf7b);
    b = hh(b, c, d, a, words[index + 6], 23, 0x04881d05);
    a = hh(a, b, c, d, words[index + 9], 4, -0x262b2fc7);
    d = hh(d, a, b, c, words[index + 12], 11, -0x1924661b);
    c = hh(c, d, a, b, words[index + 15], 16, 0x1fa27cf8);
    b = hh(b, c, d, a, words[index + 2], 23, -0x3b53a99b);

    a = ii(a, b, c, d, words[index], 6, -0x0bd6ddbc);
    d = ii(d, a, b, c, words[index + 7], 10, 0x432aff97);
    c = ii(c, d, a, b, words[index + 14], 15, -0x546bdc59);
    b = ii(b, c, d, a, words[index + 5], 21, -0x036c5fc7);
    a = ii(a, b, c, d, words[index + 12], 6, 0x655b59c3);
    d = ii(d, a, b, c, words[index + 3], 10, -0x70f3336e);
    c = ii(c, d, a, b, words[index + 10], 15, -0x00100b83);
    b = ii(b, c, d, a, words[index + 1], 21, -0x7a7ba22f);
    a = ii(a, b, c, d, words[index + 8], 6, 0x6fa87e4f);
    d = ii(d, a, b, c, words[index + 15], 10, -0x01d31920);
    c = ii(c, d, a, b, words[index + 6], 15, -0x5cfebcec);
    b = ii(b, c, d, a, words[index + 13], 21, 0x4e0811a1);
    a = ii(a, b, c, d, words[index + 4], 6, -0x08ac817e);
    d = ii(d, a, b, c, words[index + 11], 10, -0x42c50dcb);
    c = ii(c, d, a, b, words[index + 2], 15, 0x2ad7d2bb);
    b = ii(b, c, d, a, words[index + 9], 21, -0x14792c6f);

    a = add32(a, oldA);
    b = add32(b, oldB);
    c = add32(c, oldC);
    d = add32(d, oldD);
  }

  return hex32(a) + hex32(b) + hex32(c) + hex32(d);
}

const KECCAK_MASK = (1n << 64n) - 1n;
const KECCAK_ROTATION = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
];
const KECCAK_ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];

function rotateLeft64(value: bigint, amount: number): bigint {
  if (amount === 0) return value & KECCAK_MASK;
  const shift = BigInt(amount);
  return ((value << shift) | (value >> (64n - shift))) & KECCAK_MASK;
}

function keccakPermutation(state: bigint[]): void {
  for (const roundConstant of KECCAK_ROUND_CONSTANTS) {
    const columns = Array.from(
      { length: 5 },
      (_, x) => state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20],
    );
    const deltas = Array.from(
      { length: 5 },
      (_, x) => columns[(x + 4) % 5] ^ rotateLeft64(columns[(x + 1) % 5], 1),
    );
    for (let index = 0; index < 25; index += 1) state[index] ^= deltas[index % 5];

    const rotated = new Array<bigint>(25).fill(0n);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        rotated[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLeft64(
          state[x + 5 * y],
          KECCAK_ROTATION[x + 5 * y],
        );
      }
    }
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        state[x + 5 * y] =
          rotated[x + 5 * y] ^
          (~rotated[((x + 1) % 5) + 5 * y] & KECCAK_MASK & rotated[((x + 2) % 5) + 5 * y]);
      }
    }
    state[0] ^= roundConstant;
  }
}

function sha3_256(bytes: Uint8Array): string {
  const rate = 136;
  const paddingLength = rate - (bytes.length % rate);
  const padded = new Uint8Array(bytes.length + paddingLength);
  padded.set(bytes);
  padded[bytes.length] = 0x06;
  padded[padded.length - 1] |= 0x80;
  const state = new Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let lane = 0; lane < rate / 8; lane += 1) {
      let value = 0n;
      for (let byte = 0; byte < 8; byte += 1) {
        value |= BigInt(padded[offset + lane * 8 + byte]) << BigInt(byte * 8);
      }
      state[lane] ^= value;
    }
    keccakPermutation(state);
  }
  const digest = new Uint8Array(32);
  for (let index = 0; index < digest.length; index += 1) {
    digest[index] = Number((state[Math.floor(index / 8)] >> BigInt((index % 8) * 8)) & 0xffn);
  }
  return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function hashText(input: string, algorithm: HashAlgorithm): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (algorithm === 'MD5') return md5Bytes(bytes);
  if (algorithm === 'SHA3-256') return sha3_256(bytes);
  const digest = await crypto.subtle.digest(algorithm, bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  );
}
