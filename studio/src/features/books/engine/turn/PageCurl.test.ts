import { describe, expect, it } from 'vitest';
import { computePageCurlPoint, progressFromDrag, shouldCommitTurn } from './PageCurl';

describe('PageCurl', () => {
  it('keeps the horizontal paper length stable throughout a turn', () => {
    const pageWidth = 0.98;
    const pageHeight = 1.4;
    let maximumError = 0;

    for (const direction of ['forward', 'backward'] as const) {
      for (const progress of [0, 0.12, 0.25, 0.5, 0.75, 0.94, 1]) {
        let previous = computePageCurlPoint({
          x: 0,
          y: pageHeight * 0.32,
          pageWidth,
          pageHeight,
          progress,
          direction,
        });
        let length = 0;
        for (let index = 1; index <= 256; index += 1) {
          const point = computePageCurlPoint({
            x: (pageWidth * index) / 256,
            y: pageHeight * 0.32,
            pageWidth,
            pageHeight,
            progress,
            direction,
          });
          length += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z);
          previous = point;
        }
        maximumError = Math.max(maximumError, Math.abs(length / pageWidth - 1));
      }
    }

    expect(maximumError).toBeLessThan(0.012);
  });

  it('does not convert an outward drag into a page turn', () => {
    const progress = progressFromDrag(1, 1.18, 1.5, 'forward');
    expect(progress).toBe(0);
    expect(shouldCommitTurn({ progress, velocity: 0 })).toBe(false);
  });
});
