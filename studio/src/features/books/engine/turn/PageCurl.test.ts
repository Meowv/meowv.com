import { describe, expect, it } from 'vitest';
import {
  computePageCurlPoint,
  progressFromDrag,
  progressFromGrabTarget,
  shouldCommitTurn,
} from './PageCurl';

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

  it('mirrors the same paper shape when turning in opposite directions', () => {
    for (const progress of [0, 0.12, 0.35, 0.5, 0.8, 1]) {
      for (const x of [0, 0.3, 0.7, 0.98]) {
        const input = {
          x,
          y: 0.34,
          pageWidth: 0.98,
          pageHeight: 1.4,
          progress,
          pointerV: 0.74,
          verticalDrag: 0.48,
        };
        const forward = computePageCurlPoint({ ...input, direction: 'forward' });
        const backward = computePageCurlPoint({ ...input, direction: 'backward' });
        expect(forward.x).toBeCloseTo(-backward.x, 5);
        expect(forward.y).toBeCloseTo(backward.y, 5);
        expect(forward.z).toBeCloseTo(backward.z, 5);
      }
    }
  });

  it('keeps a vertically dragged paper edge close to its original length', () => {
    const pageHeight = 1.4;
    let previous = computePageCurlPoint({
      x: 0.8,
      y: -pageHeight / 2,
      pageWidth: 0.98,
      pageHeight,
      progress: 0.5,
      direction: 'forward',
      pointerV: 0.83,
      verticalDrag: 1,
    });
    let length = 0;
    for (let index = 1; index <= 128; index += 1) {
      const current = computePageCurlPoint({
        x: 0.8,
        y: (index / 128 - 0.5) * pageHeight,
        pageWidth: 0.98,
        pageHeight,
        progress: 0.5,
        direction: 'forward',
        pointerV: 0.83,
        verticalDrag: 1,
      });
      length += Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
      previous = current;
    }
    expect(Math.abs(length / pageHeight - 1)).toBeLessThan(0.015);
  });

  it('maps a grabbed point to the pointer in both directions', () => {
    const forward = (progress: number) => Math.cos(Math.PI * progress);
    const backward = (progress: number) => -Math.cos(Math.PI * progress);
    expect(progressFromGrabTarget(1, -1, 0.25, forward)).toBeCloseTo(Math.acos(0.25) / Math.PI, 3);
    expect(progressFromGrabTarget(-1, 1, -0.25, backward)).toBeCloseTo(
      Math.acos(0.25) / Math.PI,
      3,
    );
    expect(progressFromGrabTarget(1, -1, 1.2, forward)).toBe(0);
    expect(progressFromGrabTarget(-1, 1, 1.2, backward)).toBe(1);
  });

  it('recovers a grabbed point even when vertical twist bends its horizontal path', () => {
    for (const direction of ['forward', 'backward'] as const) {
      for (const x of [0.3, 0.7, 0.98]) {
        for (const y of [-0.45, 0.45]) {
          const project = (progress: number): number =>
            computePageCurlPoint({
              x,
              y,
              pageWidth: 0.98,
              pageHeight: 1.4,
              progress,
              direction,
              pointerV: 0.8,
              verticalDrag: 0.6,
            }).x;
          for (const progress of [0.25, 0.5, 0.75]) {
            const target = project(progress);
            const resolved = progressFromGrabTarget(
              project(0),
              project(1),
              target,
              project,
              progress,
            );
            expect(Math.abs(project(resolved) - target)).toBeLessThan(0.005);
          }
        }
      }
    }
  });

  it('moves the held corner vertically without stretching the page edge', () => {
    const input = {
      x: 0.9,
      y: 0.35,
      pageWidth: 0.98,
      pageHeight: 1.4,
      progress: 0.5,
      direction: 'forward' as const,
      pointerV: 0.75,
    };
    const neutral = computePageCurlPoint({ ...input, verticalDrag: 0 });
    const raised = computePageCurlPoint({ ...input, verticalDrag: 1 });
    const lowered = computePageCurlPoint({ ...input, verticalDrag: -1 });
    expect(raised.y - neutral.y).toBeGreaterThan(0.2);
    expect(neutral.y - lowered.y).toBeGreaterThan(0.2);
  });
});
