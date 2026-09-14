import { describe, expect, it } from 'vitest';
import { enqueueMermaidTask } from './scheduler';

describe('Mermaid scheduler', () => {
  it('runs configuration and render tasks in submission order', async () => {
    const events: string[] = [];
    const first = enqueueMermaidTask(async () => {
      events.push('first-start');
      await Promise.resolve();
      events.push('first-end');
      return 1;
    });
    const second = enqueueMermaidTask(() => {
      events.push('second');
      return 2;
    });

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual(['first-start', 'first-end', 'second']);
  });
});
