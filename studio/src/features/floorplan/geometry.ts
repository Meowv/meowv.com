import { WALLS, WINS } from './catalog';
import type { Furniture, PlanState, Point, Rect, Room } from './types';

export const area = (poly: Point[]) =>
  Math.abs(
    poly.reduce((sum, p, i) => {
      const q = poly[(i + 1) % poly.length]!;
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2e6;
export const perim = (poly: Point[]) =>
  poly.reduce((sum, p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    return sum + Math.hypot(q[0] - p[0], q[1] - p[1]);
  }, 0) / 1000;
export function bbox(poly: Point[]): Rect {
  return [
    Math.min(...poly.map((p) => p[0])),
    Math.min(...poly.map((p) => p[1])),
    Math.max(...poly.map((p) => p[0])),
    Math.max(...poly.map((p) => p[1])),
  ];
}
export function aabb(f: Furniture) {
  const a = (f.rot * Math.PI) / 180,
    c = Math.abs(Math.cos(a)),
    s = Math.abs(Math.sin(a));
  return { hw: (f.w / 2) * c + (f.d / 2) * s, hh: (f.w / 2) * s + (f.d / 2) * c };
}
export const norm = (a: number) => ((Math.round(a) % 360) + 360) % 360;
export function pointInPolygon(p: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!,
      b = poly[j]!;
    const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
    if (
      Math.abs(cross) < 1e-7 &&
      p[0] >= Math.min(a[0], b[0]) &&
      p[0] <= Math.max(a[0], b[0]) &&
      p[1] >= Math.min(a[1], b[1]) &&
      p[1] <= Math.max(a[1], b[1])
    )
      return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function roomPoint(room: Room): Point {
  const [x0, y0, x1, y1] = bbox(room.poly),
    center: Point = [(x0 + x1) / 2, (y0 + y1) / 2];
  if (pointInPolygon(center, room.poly)) return center;
  if (room.at && pointInPolygon(room.at, room.poly)) return [...room.at];
  // 扫描多边形边界之间的水平带，寻找可靠的内部点。
  const ys = [...new Set(room.poly.map((p) => p[1]))].sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) {
    const y = (ys[i - 1]! + ys[i]!) / 2,
      xs: number[] = [];
    room.poly.forEach((a, j) => {
      const b = room.poly[(j + 1) % room.poly.length]!;
      if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    });
    xs.sort((a, b) => a - b);
    if (xs.length >= 2) return [(xs[0]! + xs[1]!) / 2, y];
  }
  return [...room.poly[0]!];
}
export function snapRects(state: PlanState): Rect[] {
  return [
    ...WALLS.filter((_, i) => !state.demolished.includes('w' + i)).map(
      (w) => w.slice(0, 4) as Rect,
    ),
    ...WINS,
  ];
}
export function snapMove(
  f: Furniture,
  cx: number,
  cy: number,
  scale: number,
  state: PlanState,
  wallSnap = true,
): Point {
  let nx = Math.round(cx / 10) * 10,
    ny = Math.round(cy / 10) * 10;
  if (!wallSnap) return [nx, ny];
  const { hw, hh } = aabb(f),
    tol = 10 / Math.max(0.001, scale);
  let bx = tol,
    by = tol;
  for (const r of snapRects(state)) {
    if (!(r[3] < cy - hh - tol || r[1] > cy + hh + tol))
      for (const ex of [r[0], r[2]])
        for (const c of [ex + hw, ex - hw])
          if (Math.abs(c - cx) < bx) {
            bx = Math.abs(c - cx);
            nx = c;
          }
    if (!(r[2] < cx - hw - tol || r[0] > cx + hw + tol))
      for (const ey of [r[1], r[3]])
        for (const c of [ey + hh, ey - hh])
          if (Math.abs(c - cy) < by) {
            by = Math.abs(c - cy);
            ny = c;
          }
  }
  return [nx, ny];
}
export function pushOut(f: Furniture, state: PlanState): Furniture {
  for (let n = 0; n < 4; n++) {
    let moved = false;
    for (const r of snapRects(state)) {
      const { hw, hh } = aabb(f),
        ox = Math.min(f.cx + hw, r[2]) - Math.max(f.cx - hw, r[0]),
        oy = Math.min(f.cy + hh, r[3]) - Math.max(f.cy - hh, r[1]);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) f.cx = f.cx < (r[0] + r[2]) / 2 ? r[0] - hw : r[2] + hw;
      else f.cy = f.cy < (r[1] + r[3]) / 2 ? r[1] - hh : r[3] + hh;
      moved = true;
    }
    if (!moved) break;
  }
  return f;
}
export function resizeFurniture(f: Furniture, p: Point): Partial<Furniture> {
  const a = (f.rot * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    dx = p[0] - f.cx,
    dy = p[1] - f.cy;
  const w = Math.max(50, Math.round((dx * c + dy * s + f.w / 2) / 10) * 10),
    d = Math.max(50, Math.round((-dx * s + dy * c + f.d / 2) / 10) * 10);
  const mx = (w - f.w) / 2,
    my = (d - f.d) / 2;
  return { w, d, cx: f.cx + mx * c - my * s, cy: f.cy + mx * s + my * c };
}
