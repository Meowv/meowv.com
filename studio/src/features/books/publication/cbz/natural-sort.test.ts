import { describe, expect, it } from 'vitest';
import { compareBookFilenames, sortBookFilenames } from './natural-sort';

describe('compareBookFilenames', () => {
  it('按数字大小而不是字典序比较', () => {
    expect(compareBookFilenames('page2.png', 'page10.png')).toBeLessThan(0);
    expect(compareBookFilenames('page10.png', 'page2.png')).toBeGreaterThan(0);
  });

  it('忽略大小写差异', () => {
    expect(compareBookFilenames('Page2.png', 'page2.png')).toBe(0);
  });

  it('相同文件名返回 0', () => {
    expect(compareBookFilenames('a.png', 'a.png')).toBe(0);
  });
});

describe('sortBookFilenames', () => {
  it('按自然顺序排列页码', () => {
    expect(sortBookFilenames(['p10.png', 'p2.png', 'p1.png'])).toEqual([
      'p1.png',
      'p2.png',
      'p10.png',
    ]);
  });

  it('处理多位数字与混合前缀', () => {
    expect(sortBookFilenames(['ch1-3.png', 'ch1-20.png', 'ch1-1.png'])).toEqual([
      'ch1-1.png',
      'ch1-3.png',
      'ch1-20.png',
    ]);
  });

  it('不修改传入数组', () => {
    const input = ['b.png', 'a.png'];
    const sorted = sortBookFilenames(input);

    expect(sorted).toEqual(['a.png', 'b.png']);
    expect(input).toEqual(['b.png', 'a.png']);
  });

  it('空数组返回空数组', () => {
    expect(sortBookFilenames([])).toEqual([]);
  });
});
