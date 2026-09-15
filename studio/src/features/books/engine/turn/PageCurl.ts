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

const cornerPickupEnvelope = (progress: number): number =>
  smoothstep(0, 0.12, progress) * (1 - smoothstep(0.18, 0.52, progress));

interface CurlProfile {
  distanceFromSpine: number;
  u: number;
  v: number;
  baseAngle: number;
  angleAtEdge: number;
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
  const turnProgress = smoothstep(0.045, 0.96, progress);
  const distanceFromSpine = clamp(Math.abs(x), 0, pageWidth);
  const u = clamp(distanceFromSpine / Math.max(pageWidth, Number.EPSILON), 0, 1);
  const v = clamp(y / Math.max(pageHeight, Number.EPSILON) + 0.5, 0, 1);
  const phaseSine = Math.sin(Math.PI * progress);
  const phase = phaseSine * phaseSine;
  const edgeProfile = smoothstep(0.56, 1, u);
  const profile = Math.sin(Math.PI * u) * 0.72 + edgeProfile * 0.28;
  const cornerInfluence = 1 - smoothstep(0.15, 0.9, Math.abs(v - pointerV));
  const requestedCurl = curlStrength * phase * profile * (0.7 + cornerInfluence * 0.3);
  const baseAngle = direction === 'forward' ? Math.PI * turnProgress : Math.PI * (1 - turnProgress);
  const curlLimit = direction === 'forward' ? Math.PI - baseAngle : baseAngle;
  const curlAngle = Math.min(requestedCurl, curlLimit * 0.72);
  const curlSign = direction === 'forward' ? 1 : -1;
  const angleAtEdge = clamp(baseAngle + curlAngle * curlSign, 0, Math.PI);
  const twist = clamp(verticalDrag, -1, 1) * twistStrength * profile * phase;
  const sag = sagStrength * profile * phase;
  const pickup = cornerPickupEnvelope(progress);
  const cornerPickup =
    pageWidth *
    0.022 *
    edgeProfile *
    edgeProfile *
    cornerInfluence *
    cornerInfluence *
    pickup *
    cornerPickupStrength;

  return {
    distanceFromSpine,
    u,
    v,
    baseAngle,
    angleAtEdge,
    sag,
    twist,
    cornerPickup,
  };
}

function developablePoint(
  distanceFromSpine: number,
  baseAngle: number,
  angleAtEdge: number,
  pageWidth: number,
): { x: number; z: number } {
  const curvature = (angleAtEdge - baseAngle) / Math.max(pageWidth, Number.EPSILON);
  if (Math.abs(curvature) < 1e-5) {
    return {
      x: distanceFromSpine * Math.cos(baseAngle),
      z: distanceFromSpine * Math.sin(baseAngle),
    };
  }

  const angle = baseAngle + curvature * distanceFromSpine;
  return {
    x: (Math.sin(angle) - Math.sin(baseAngle)) / curvature,
    z: (-Math.cos(angle) + Math.cos(baseAngle)) / curvature,
  };
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
  const point = developablePoint(
    profile.distanceFromSpine,
    profile.baseAngle,
    profile.angleAtEdge,
    pageWidth,
  );

  return {
    x: point.x,
    y: input.y + profile.twist * (profile.v - 0.5) * 2,
    z: Math.max(0, point.z - profile.sag) + profile.twist * 0.24 + profile.cornerPickup,
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
  const point = developablePoint(
    profile.distanceFromSpine,
    profile.baseAngle,
    profile.angleAtEdge,
    frame.pageWidth,
  );
  const normalAngle =
    profile.baseAngle +
    ((profile.angleAtEdge - profile.baseAngle) * profile.distanceFromSpine) /
      Math.max(frame.pageWidth, Number.EPSILON);
  target[offset] = point.x - surfaceOffset * Math.sin(normalAngle);
  target[offset + 1] = y + profile.twist * (profile.v - 0.5) * 2;
  target[offset + 2] =
    Math.max(0, point.z - profile.sag) +
    profile.twist * 0.24 +
    profile.cornerPickup +
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

export function shouldCommitTurn({
  progress,
  velocity,
  progressThreshold = 0.32,
  velocityThreshold = 0.85,
}: DragTurnDecisionInput): boolean {
  return progress > progressThreshold || velocity > velocityThreshold;
}
