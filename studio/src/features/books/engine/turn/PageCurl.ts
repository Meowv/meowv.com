import { DEFAULT_BOOK_CONFIG, type BookConfig } from '../BookConfig';

export type TurnDirection = 'forward' | 'backward';

export interface PageCurlInput {
  x: number;
  y: number;
  pageWidth: number;
  pageHeight: number;
  progress: number;
  direction: TurnDirection;
  pointerV?: number;
  verticalDrag?: number;
  curlStrength?: number;
  twistStrength?: number;
  sagStrength?: number;
}

export interface PageCurlPoint {
  x: number;
  y: number;
  z: number;
}

export interface DragTurnDecisionInput {
  progress: number;
  velocity: number;
  progressThreshold?: number;
  velocityThreshold?: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const smoothstep = (minimum: number, maximum: number, value: number): number => {
  const unit = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return unit * unit * (3 - 2 * unit);
};

export function easeInOutCubic(value: number): number {
  const unit = clamp(value, 0, 1);
  return unit < 0.5 ? 4 * unit ** 3 : 1 - (-2 * unit + 2) ** 3 / 2;
}

export function computePageCurlPoint(input: PageCurlInput): PageCurlPoint {
  const {
    pageWidth,
    pageHeight,
    direction,
    pointerV = 0.82,
    verticalDrag = 0,
    curlStrength = DEFAULT_BOOK_CONFIG.curlStrength,
    twistStrength = DEFAULT_BOOK_CONFIG.twistStrength,
    sagStrength = DEFAULT_BOOK_CONFIG.sagStrength,
  } = input;
  const progress = clamp(input.progress, 0, 1);
  const distanceFromSpine = Math.abs(input.x);
  const u = clamp(distanceFromSpine / Math.max(pageWidth, Number.EPSILON), 0, 1);
  const v = clamp(input.y / Math.max(pageHeight, Number.EPSILON) + 0.5, 0, 1);
  const phase = Math.sin(Math.PI * progress);
  const profile = Math.sin(Math.PI * u);
  const cornerInfluence = 1 - smoothstep(0.15, 0.9, Math.abs(v - pointerV));
  const curl = curlStrength * phase * profile * (0.7 + cornerInfluence * 0.3);
  const baseAngle = direction === 'forward' ? Math.PI * progress : Math.PI * (1 - progress);
  const curlSign = direction === 'forward' ? 1 : -1;
  const theta = baseAngle + curl * curlSign;
  const twist = clamp(verticalDrag, -1, 1) * twistStrength * profile * phase;
  const sag = sagStrength * profile * phase;

  return {
    x: distanceFromSpine * Math.cos(theta),
    y: input.y + twist * (v - 0.5) * 2,
    z: Math.max(0, distanceFromSpine * Math.sin(theta) - sag) + twist * profile * 0.24,
  };
}

export function getGutterOffset(
  distanceFromSpine: number,
  config: Pick<BookConfig, 'gutterDepth' | 'gutterFalloff'> = DEFAULT_BOOK_CONFIG,
): number {
  const distance = Math.max(0, distanceFromSpine);
  return -config.gutterDepth * Math.exp(-distance / config.gutterFalloff);
}

export function progressFromDrag(
  startX: number,
  currentX: number,
  effectiveTurnDistance: number,
  direction: TurnDirection,
): number {
  const signedDistance = direction === 'forward' ? startX - currentX : currentX - startX;
  return clamp(signedDistance / Math.max(effectiveTurnDistance, Number.EPSILON), 0, 1);
}

export function shouldCommitTurn({
  progress,
  velocity,
  progressThreshold = 0.32,
  velocityThreshold = 0.85,
}: DragTurnDecisionInput): boolean {
  return progress > progressThreshold || velocity > velocityThreshold;
}
