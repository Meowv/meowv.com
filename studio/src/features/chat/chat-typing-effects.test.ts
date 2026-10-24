import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChatTypingEffects,
  makeTypingParticles,
  advanceTypingParticles,
} from './chat-typing-effects';
describe('Chat typing particles', () => {
  it('limits burst size and lifetime for all modes', () => {
    for (const mode of ['stars', 'rainbow', 'fireworks'] as const) {
      const particles = makeTypingParticles(10, 20, 1000, mode, () => 0.5);
      expect(particles.length).toBeLessThanOrEqual(6);
      expect(particles.every((particle) => particle.life <= 700)).toBe(true);
      expect(advanceTypingParticles(particles, 1701, 0.016)).toEqual([]);
    }
    expect(makeTypingParticles(0, 0, 0, 'off')).toEqual([]);
  });
  it('caps retained particles and moves them over elapsed time', () => {
    const particles = Array.from(
      { length: 100 },
      () => makeTypingParticles(10, 20, 1000, 'rainbow', () => 0.5)[0]!,
    );
    const next = advanceTypingParticles(particles, 1016, 0.016);
    expect(next).toHaveLength(80);
    expect(next[0]!.y).not.toBe(20);
    expect(particles[0]!.y).toBe(20);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('runs one animation loop, stops for reduced motion/background and releases listeners', () => {
  const motion = Object.assign(new EventTarget(), { matches: false });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = Object.assign(new EventTarget(), {
    matchMedia: () => motion,
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
  });
  const remove = vi.spyOn(win, 'removeEventListener');
  const context = { setTransform: vi.fn(), clearRect: vi.fn() };
  const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  const request = vi.fn().mockReturnValue(1);
  const cancel = vi.fn();
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
  const effects = new ChatTypingEffects(canvas, () => ({ x: 10, y: 20 }));
  effects.burst();
  effects.burst();
  clock.mockReturnValue(160);
  effects.burst();
  expect(request).toHaveBeenCalledTimes(1);
  expect(canvas.width).toBe(780);
  motion.matches = true;
  motion.dispatchEvent(new Event('change'));
  effects.burst();
  expect(cancel).toHaveBeenCalledWith(1);
  expect(request).toHaveBeenCalledTimes(1);
  motion.matches = false;
  doc.hidden = true;
  effects.burst();
  expect(request).toHaveBeenCalledTimes(1);
  doc.hidden = false;
  effects.setMode('off');
  effects.burst();
  expect(request).toHaveBeenCalledTimes(1);
  effects.destroy();
  expect(remove).toHaveBeenCalledTimes(2);
});

it('triggers for deletion, paste, history and intermediate composition text, but deduplicates unchanged content', () => {
  const motion = Object.assign(new EventTarget(), { matches: false });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = Object.assign(new EventTarget(), { matchMedia: () => motion });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
  const effects = new ChatTypingEffects(canvas, () => ({ x: 1, y: 1 }));
  const burst = vi.spyOn(effects, 'burst').mockImplementation(() => {});
  effects.contentChanged('');
  effects.contentChanged('abc');
  effects.contentChanged('ab');
  effects.contentChanged('abn');
  effects.contentChanged('abni');
  effects.contentChanged('ab你');
  effects.contentChanged('ab你');
  effects.contentChanged('ab你 粘贴');
  effects.contentChanged('ab你');
  expect(burst).toHaveBeenCalledTimes(7);
  effects.destroy();
});
