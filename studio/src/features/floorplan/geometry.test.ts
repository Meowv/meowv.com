import { describe, expect, it } from 'vitest';
import { LIB, ROOMS, defaultState } from './catalog';
import {
  aabb,
  area,
  pointInPolygon,
  resizeFurniture,
  roomPoint,
  snapMove,
  snapRects,
} from './geometry';
import { dimensionsSvg, furnitureSvg, materialDefs, openingsSvg } from './svg';
import type { Furniture, Room } from './types';

const furniture: Furniture = {
  id: 'test',
  type: 'table',
  name: '桌子',
  cx: 5000,
  cy: 5000,
  w: 1200,
  d: 600,
  rot: 0,
  color: '#ccbbaa',
};
describe('原户型几何与交互约束', () => {
  it('保留原户型计入面积与实际内部落点', () => {
    expect(
      ROOMS.filter((r) => r.counted !== false).reduce((sum, r) => sum + area(r.poly), 0),
    ).toBeCloseTo(87.1828, 5);
    for (const room of ROOMS) expect(pointInPolygon(roomPoint(room), room.poly)).toBe(true);
  });
  it('凹多边形中心在外部时使用内部点', () => {
    const room: Room = {
      id: 'concave',
      name: '',
      mat: '',
      poly: [
        [0, 0],
        [1000, 0],
        [1000, 200],
        [200, 200],
        [200, 1000],
        [0, 1000],
      ],
    };
    expect(pointInPolygon([500, 500], room.poly)).toBe(false);
    expect(pointInPolygon(roomPoint(room), room.poly)).toBe(true);
    expect(pointInPolygon([0, 500], room.poly)).toBe(true);
  });
  it('任意旋转下调整尺寸固定对角点且限制 50mm', () => {
    const f = { ...furniture, rot: 37 },
      a = (f.rot * Math.PI) / 180;
    const anchor = (v: Furniture) => [
      v.cx - (v.w / 2) * Math.cos(a) + (v.d / 2) * Math.sin(a),
      v.cy - (v.w / 2) * Math.sin(a) - (v.d / 2) * Math.cos(a),
    ];
    const resized = { ...f, ...resizeFurniture(f, [6400, 6100]) };
    expect(anchor(resized)[0]).toBeCloseTo(anchor(f)[0]!);
    expect(anchor(resized)[1]).toBeCloseTo(anchor(f)[1]!);
    const small = resizeFurniture(f, [0, 0]);
    expect(small.w).toBeGreaterThanOrEqual(50);
    expect(small.d).toBeGreaterThanOrEqual(50);
  });
  it('墙体吸附采用当前视图像素容差并跳过拆除墙', () => {
    const state = defaultState();
    expect(snapMove(furniture, 1234, 5678, 1, state, false)).toEqual([1230, 5680]);
    state.demolished = ['w38'];
    expect(snapRects(state)).toHaveLength(59);
    expect(aabb({ ...furniture, rot: 90 }).hw).toBeCloseTo(300);
    const near = { ...furniture, cx: 4573, cy: 1000, w: 100, d: 100 };
    expect(snapMove(near, 4538, 1000, 1, state, true)[0]).toBe(4540);
    expect(snapMove(near, 4538, 1000, 1, defaultState(), true)[0]).toBe(4530);
    expect(snapMove(near, 4538, 1000, 2, defaultState(), true)[0]).toBe(4540);
  });
});

describe('内置 SVG 渲染', () => {
  it('包含全部材质和原始尺寸与开口', () => {
    expect(materialDefs().match(/<pattern /g)).toHaveLength(9);
    expect(dimensionsSvg()).toContain('11850');
    expect(openingsSvg()).toContain('入户');
  });
  it('家具用户名称和非法颜色不能注入 SVG', () => {
    const html = furnitureSvg({
      ...furniture,
      name: '<script>alert(1)</script>',
      color: 'red" onload="alert(1)',
    });
    expect(html).not.toContain('script');
    expect(html).not.toContain('onload');
    expect(html).toContain('#ccc');
  });
  it('小尺寸家具不生成负的宽高或半径', () => {
    for (const [type] of LIB.flatMap((group) => group.items)) {
      const html = furnitureSvg({ ...furniture, type, w: 50, d: 50 });
      expect(html).not.toMatch(/(?:width|height|rx|ry|r)="-/);
      expect(html).not.toContain('NaN');
    }
  });
});
