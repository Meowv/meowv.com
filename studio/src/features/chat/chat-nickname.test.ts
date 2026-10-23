import { describe, expect, it, vi } from 'vitest';
import { generateChatNickname } from './chat-nickname';
import { validNickname } from './chat-state';

describe('Chat random nicknames', () => {
  it('generates varied nicknames within the existing Unicode and byte limits', () => {
    let seed = 42;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    });
    try {
      const names = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const name = generateChatNickname();
        expect(validNickname(name)).toBe(true);
        expect(name).not.toMatch(/游客|\d/);
        names.add(name);
      }
      expect(names.size).toBeGreaterThan(50);
    } finally {
      random.mockRestore();
    }
  });

  it('always changes the nickname when the same random selection recurs', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const first = generateChatNickname();
      const second = generateChatNickname(first);
      expect(second).not.toBe(first);
      expect(validNickname(second)).toBe(true);
    } finally {
      random.mockRestore();
    }
  });
});
