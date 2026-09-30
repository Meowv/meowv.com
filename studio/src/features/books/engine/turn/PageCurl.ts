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
  cornerPickupStrength?: number;
}

export interface PageCurlPoint {
  x: number;
  y: number;
  z: number;
}

export interface PageCurlFrame {
  pageWidth: number;
  pageHeight: number;
  progress: number;
  direction: TurnDirection;
  pointerV: number;
  verticalDrag: number;
  curlStrength: number;
  twistStrength: number;
  sagStrength: number;
  cornerPickupStrength: number;
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

const cornerPickupEnvelope = (progress: number): number => 1 - smoothstep(0.12, 0.42, progress);

const INTEGRATION_STEPS = 12;

interface CurlProfile {
  u: number;
  baseAngle: number;
  bendAngle: number;
  bendSign: number;
  creaseStart: number;
  creaseEnd: number;
  sag: number;
  twist: number;
  cornerPickup: number;
}

function getCurlProfile(
  x: number,
  y: number,
  pageWidth: number,
  pageHeight: number,
  progress: number,
  direction: TurnDirection,
  pointerV: number,
  verticalDrag: number,
  curlStrength: number,
  twistStrength: number,
  sagStrength: number,
  cornerPickupStrength: number,
): CurlProfile {
  const turnProgress = smoothstep(0.015, 0.985, progress);
  const distanceFromSpine = clamp(Math.abs(x), 0, pageWidth);
  const u = clamp(distanceFromSpine / Math.max(pageWidth, Number.EPSILON), 0, 1);
  const v = clamp(y / Math.max(pageHeight, Number.EPSILON) + 0.5, 0, 1);
  const phase = Math.sin(Math.PI * progress);
  const edgeProfile = smoothstep(0.56, 1, u);
  const cornerInfluence = 1 - smoothstep(0.16, 0.7, Math.abs(v - pointerV));
  const rotation = Math.PI * turnProgress;
  const bendAngle = Math.min(
    curlStrength * 1.8 * phase * (0.8 + cornerInfluence * 0.2),
    Math.min(rotation, Math.PI - rotation) * 1.72,
  );
  const forwardBaseAngle = rotation - bendAngle * 0.45;
  const baseAngle = direction === 'forward' ? forwardBaseAngle : Math.PI - forwardBaseAngle;
  const bendSign = direction === 'forward' ? 1 : -1;
  const creaseCenter = 0.82 - turnProgress * 0.58;
  const creaseWidth = 0.28 + phase * 0.1;
  const twist =
    clamp(verticalDrag, -1, 1) *
    twistStrength *
    smoothstep(0, 1, u) *
    (0.3 + phase * 0.7) *
    (1 - smoothstep(0.9, 1, progress));
  const gravityStage = 0.45 + smoothstep(0.25, 0.82, progress) * 0.55;
  const sag = sagStrength * phase * gravityStage * u ** 1.5 * (1 - cornerInfluence * 0.65);
  const pickup = cornerPickupEnvelope(progress);
  const cornerPickup =
    0.032 *
    edgeProfile *
    edgeProfile *
    cornerInfluence *
    cornerInfluence *
    pickup *
    cornerPickupStrength;

  return {
    u,
    baseAngle,
    bendAngle,
    bendSign,
    creaseStart: creaseCenter - creaseWidth / 2,
    creaseEnd: creaseCenter + creaseWidth / 2,
    sag,
    twist,
    cornerPickup,
  };
}

function angleAt(profile: CurlProfile, u: number): number {
  return (
    profile.baseAngle +
    profile.bendSign *
      profile.bendAngle *
      (0.28 * smoothstep(0, 0.24, u) + 0.72 * smoothstep(profile.creaseStart, profile.creaseEnd, u))
  );
}

function bentPoint(profile: CurlProfile, pageWidth: number): { x: number; z: number } {
  if (profile.u === 0) return { x: 0, z: 0 };
  const step = profile.u / INTEGRATION_STEPS;
  let x = 0;
  let z = 0;
  for (let index = 0; index <= INTEGRATION_STEPS; index += 1) {
    const angle = angleAt(profile, step * index);
    const weight = index === 0 || index === INTEGRATION_STEPS ? 1 : index % 2 === 0 ? 2 : 4;
    x += Math.cos(angle) * weight;
    z += Math.sin(angle) * weight;
  }
  const scale = (pageWidth * step) / 3;
  return { x: x * scale, z: z * scale };
}

function sweptPoint(point: { x: number; z: number }, y: number, twist: number): PageCurlPoint {
  const radius = Math.hypot(point.x, point.z);
  if (radius < Number.EPSILON || Math.abs(twist) < Number.EPSILON) {
    return { x: point.x, y, z: point.z };
  }
  const sweptRadius = radius * Math.cos(twist) - y * Math.sin(twist);
  const scale = sweptRadius / radius;
  return {
    x: point.x * scale,
    y: radius * Math.sin(twist) + y * Math.cos(twist),
    z: point.z * scale,
  };
}

function contactHeight(height: number, pageWidth: number): number {
  const lifted = Math.max(0, height);
  return (lifted * lifted) / (lifted + pageWidth * 0.004);
}

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
    cornerPickupStrength = 1,
  } = input;
  const progress = clamp(input.progress, 0, 1);
  const profile = getCurlProfile(
    input.x,
    input.y,
    pageWidth,
    pageHeight,
    progress,
    direction,
    pointerV,
    verticalDrag,
    curlStrength,
    twistStrength,
    sagStrength,
    cornerPickupStrength,
  );
  const point = bentPoint(profile, pageWidth);
  const swept = sweptPoint(point, input.y, profile.twist);

  return {
    x: swept.x,
    y: swept.y,
    z: contactHeight(swept.z - profile.sag + profile.cornerPickup, pageWidth),
  };
}

export function writePageCurlPoint(
  target: Float32Array,
  offset: number,
  x: number,
  y: number,
  frame: PageCurlFrame,
  surfaceOffset = 0,
): void {
  const progress = clamp(frame.progress, 0, 1);
  const profile = getCurlProfile(
    x,
    y,
    frame.pageWidth,
    frame.pageHeight,
    progress,
    frame.direction,
    frame.pointerV,
    frame.verticalDrag,
    frame.curlStrength,
    frame.twistStrength,
    frame.sagStrength,
    frame.cornerPickupStrength,
  );
  const point = bentPoint(profile, frame.pageWidth);
  const swept = sweptPoint(point, y, profile.twist);
  const normalAngle = angleAt(profile, profile.u);
  target[offset] = swept.x - surfaceOffset * Math.sin(normalAngle);
  target[offset + 1] = swept.y;
  target[offset + 2] =
    contactHeight(swept.z - profile.sag + profile.cornerPickup, frame.pageWidth) +
    surfaceOffset * Math.cos(normalAngle);
}

export function getGutterOffset(
  distanceFromSpine: number,
  config: Pick<BookConfig, 'gutterDepth' | 'gutterFalloff'> = DEFAULT_BOOK_CONFIG,
  edgeInfluence = 1,
): number {
  const distance = Math.max(0, distanceFromSpine);
  const gutterOffset = config.gutterDepth * (1 - Math.exp(-distance / config.gutterFalloff));
  return config.gutterDepth + (gutterOffset - config.gutterDepth) * clamp(edgeInfluence, 0, 1);
}

export function getGutterEdgeInfluence(y: number, pageHeight: number): number {
  const distanceFromEdge = Math.max(0, pageHeight / 2 - Math.abs(y));
  return smoothstep(0, pageHeight * 0.04, distanceFromEdge);
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

export function progressFromGrabTarget(
  start: number,
  end: number,
  target: number,
  projectAtProgress: (progress: number) => number,
  previousProgress = 0,
): number {
  const sampleCount = 24;
  let closestProgress = 0;
  let closestError = Math.abs(start - target);
  let nearestCrossing = Infinity;
  let lower = -1;
  let upper = -1;
  let lowerValue = start;
  let previousValue = start;
  for (let index = 1; index <= sampleCount; index += 1) {
    const progress = index / sampleCount;
    const projected = index === sampleCount ? end : projectAtProgress(progress);
    const error = Math.abs(projected - target);
    if (error < closestError) {
      closestError = error;
      closestProgress = progress;
    }
    if (
      (previousValue - target) * (projected - target) <= 0 &&
      Math.abs((index - 0.5) / sampleCount - previousProgress) < nearestCrossing
    ) {
      nearestCrossing = Math.abs((index - 0.5) / sampleCount - previousProgress);
      lower = (index - 1) / sampleCount;
      upper = progress;
      lowerValue = previousValue;
    }
    previousValue = projected;
  }
  if (lower < 0) return closestProgress;

  for (let index = 0; index < 9; index += 1) {
    const middle = (lower + upper) / 2;
    const projected = projectAtProgress(middle);
    if ((lowerValue - target) * (projected - target) <= 0) upper = middle;
    else {
      lower = middle;
      lowerValue = projected;
    }
  }
  return (lower + upper) / 2;
}

export function shouldCommitTurn({
  progress,
  velocity,
  progressThreshold = 0.32,
  velocityThreshold = 0.85,
}: DragTurnDecisionInput): boolean {
  return progress > progressThreshold || velocity > velocityThreshold;
}
