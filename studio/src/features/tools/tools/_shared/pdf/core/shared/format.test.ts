import { describe, expect, it } from 'vitest';
import { formatDuration, formatFileSize, padPageNumber } from './format';

describe('formatFileSize', () => {
  it('按 1024 进制选择单位', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1.00 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.00 MB');
    expect(formatFileSize(1024 ** 3)).toBe('1.00 GB');
  });

  it('数值越大保留的小数位越少', () => {
    expect(formatFileSize(1536)).toBe('1.50 KB');
    expect(formatFileSize(10 * 1024)).toBe('10.0 KB');
    expect(formatFileSize(100 * 1024)).toBe('100 KB');
  });

  it('字节数不保留小数', () => {
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(999)).toBe('999 B');
  });

  it('小于 1 字节的正数不会落到负指数单位', () => {
    // 早期实现会算出 exponent = -1，取出 undefined 单位并输出 "512 undefined"。
    expect(formatFileSize(0.5)).toBe('1 B');
    expect(formatFileSize(0.4)).toBe('1 B');
    expect(formatFileSize(0.999)).toBe('1 B');
  });

  it('小数形式的字节数按最接近的整数输出', () => {
    expect(formatFileSize(512.4)).toBe('512 B');
    expect(formatFileSize(1023.5)).toBe('1024 B');
  });

  it('任意有限正数都返回带单位的字符串', () => {
    const samples = [0.001, 0.1, 0.5, 0.999, 1, 512, 1023.9, 1024, 1024 ** 2, 1024 ** 4];
    for (const bytes of samples) {
      expect(formatFileSize(bytes)).toMatch(/^\d+(\.\d+)? (B|KB|MB|GB)$/u);
    }
  });

  it('超过最大单位后仍以 GB 表示', () => {
    expect(formatFileSize(1024 ** 4)).toBe('1024 GB');
  });

  it('零、负数与非有限值统一返回 0 B', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(-1)).toBe('0 B');
    expect(formatFileSize(Number.NaN)).toBe('0 B');
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe('0 B');
  });
});

describe('formatDuration', () => {
  it('不足一秒时以毫秒表示', () => {
    expect(formatDuration(500)).toBe('500 毫秒');
    expect(formatDuration(999)).toBe('999 毫秒');
  });

  it('毫秒数为零或负数时至少显示 1 毫秒', () => {
    expect(formatDuration(0)).toBe('1 毫秒');
    expect(formatDuration(-100)).toBe('1 毫秒');
  });

  it('一秒到十秒之间保留一位小数', () => {
    expect(formatDuration(1000)).toBe('1.0 秒');
    expect(formatDuration(1500)).toBe('1.5 秒');
  });

  it('十秒以上不保留小数', () => {
    expect(formatDuration(10_000)).toBe('10 秒');
    expect(formatDuration(65_000)).toBe('65 秒');
  });

  it('十秒边界上的进位结果由 toFixed 决定', () => {
    expect(formatDuration(9999)).toBe('10.0 秒');
  });
});

describe('padPageNumber', () => {
  it('至少补齐到三位', () => {
    expect(padPageNumber(1, 5)).toBe('001');
    expect(padPageNumber(12, 99)).toBe('012');
  });

  it('总页数位数超过三位时按实际位数补齐', () => {
    expect(padPageNumber(1, 1000)).toBe('0001');
    expect(padPageNumber(42, 12_345)).toBe('00042');
  });

  it('页码本身超过补齐宽度时原样返回', () => {
    expect(padPageNumber(1234, 1000)).toBe('1234');
  });
});
