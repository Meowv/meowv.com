import * as THREE from 'three';
import { ROOMS, DOORS, SLIDES, WALLS, WINS } from '../catalog';
import type { PlanState, Point, Rect, SceneOptions } from '../types';
import { H, M, wx, wz, createModelFactory } from './models';
export interface SceneDoor {
  id: string;
  length: number;
  pivot: THREE.Group;
  a0: number;
  a1: number;
  cur: number;
  open: boolean;
}
export function clearGroup(group: THREE.Object3D, materials = false) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      if (materials)
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
  group.clear();
}
export function createArchitecture(
  factory: ReturnType<typeof createModelFactory>,
  getState: () => PlanState,
  opt: SceneOptions,
) {
  const { floorMat, mat, box, glassMat } = factory;
  const wallMat = mat('#f4f1eb', { roughness: 0.92 }),
    capMat = mat('#34312d', { roughness: 0.9 }),
    frameMat = mat('#5d6166', { roughness: 0.5, metalness: 0.4 });
  const archFloor = new THREE.Group(),
    archUp = new THREE.Group(),
    lampG = new THREE.Group();
  const doors: SceneDoor[] = [];
  const doorStates = new Map<string, { open: boolean; cur: number }>();
  let colliders: Rect[] = [];
  const floors = new Map<string, THREE.Mesh>();
  function wallBox(
    rect: readonly [number, number, number, number, ...unknown[]],
    yb: number,
    yt: number,
    m?: THREE.Material | THREE.Material[],
  ) {
    const [x0, y0, x1, y1] = rect;
    if (yt - yb <= 0.001) return;
    const o = new THREE.Mesh(
      new THREE.BoxGeometry(M(x1 - x0), yt - yb, M(y1 - y0)),
      m || [wallMat, wallMat, capMat, wallMat, wallMat, wallMat],
    );
    o.position.set(wx((x0 + x1) / 2), (yb + yt) / 2, wz((y0 + y1) / 2));
    o.castShadow = o.receiveShadow = true;
    archUp.add(o);
    // 漫游辅助：墙体棱线 + 踢脚线，让相邻墙面、墙角一眼可分（仅漫游模式显示）
    const ln = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry), edgeMat);
    ln.position.copy(o.position);
    ln.userData.walkOnly = true;
    ln.visible = opt.mode === 'walk';
    archUp.add(ln);
    if (yb <= 0.001) {
      const p = o.geometry.parameters,
        sh = Math.min(0.12, yt),
        sk = new THREE.Mesh(new THREE.BoxGeometry(p.width + 0.02, sh, p.depth + 0.02), skirtMat);
      sk.position.set(o.position.x, sh / 2, o.position.z);
      sk.userData.walkOnly = true;
      sk.visible = opt.mode === 'walk';
      archUp.add(sk);
    }
  }
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x6f675b }),
    skirtMat = new THREE.MeshStandardMaterial({ color: '#8b7f6e', roughness: 0.6 });
  function shapeOf(poly: Point[], flip = false) {
    const s = new THREE.Shape();
    poly.forEach(([x, y], i) => s[i ? 'lineTo' : 'moveTo'](wx(x), flip ? wz(y) : -wz(y)));
    return s;
  }

  function buildArch() {
    const state = getState();
    doors.forEach((d) => doorStates.set(d.id, { open: d.open, cur: d.cur }));
    clearGroup(archFloor);
    clearGroup(archUp);
    clearGroup(lampG, true);
    doors.length = 0;
    colliders = [];
    const top = opt.mode === 'walk' ? H : opt.cut;
    ROOMS.forEach((r) => {
      const m = floorMat(state.rooms[r.id]?.mat ?? r.mat),
        bay = r.counted === false;
      const geo = bay
        ? new THREE.ExtrudeGeometry(shapeOf(r.poly), { depth: 0.45, bevelEnabled: false })
        : new THREE.ShapeGeometry(shapeOf(r.poly));
      geo.rotateX(-Math.PI / 2);
      const fl = new THREE.Mesh(geo, bay ? [m, mat('#e9e4da')] : m);
      fl.receiveShadow = true;
      fl.userData.room = r.id;
      floors.set(r.id, fl);
      if (bay) {
        fl.castShadow = true;
        archUp.add(fl);
      } else archFloor.add(fl);
      // 天花：法线朝下，只在室内仰视时可见
      const cg = new THREE.ShapeGeometry(shapeOf(r.poly, true));
      cg.rotateX(Math.PI / 2);
      const ceil = new THREE.Mesh(cg, mat('#fbfaf7', { roughness: 1 }));
      ceil.position.y = H;
      ceil.visible = top >= H;
      archUp.add(ceil);
      if (r.at) {
        const lamp = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 0.02, 32),
          new THREE.MeshStandardMaterial({
            color: '#fff',
            emissive: '#fff2d6',
            emissiveIntensity: 0.3,
          }),
        );
        lamp.position.set(wx(r.at[0]), H - 0.012, wz(r.at[1]));
        lamp.visible = top >= H;
        lampG.add(lamp);
        const pl = new THREE.PointLight(0xffd9a8, 0, 7, 1.6);
        pl.position.set(wx(r.at[0]), H - 0.25, wz(r.at[1]));
        lampG.add(pl);
      }
    });
    [...DOORS, ...SLIDES].forEach((d) => {
      const [x0, y0, x1, y1] = d.rect;
      const s = box(
        M(x1 - x0),
        0.012,
        M(y1 - y0),
        mat('#d8d0c0', { roughness: 0.3 }),
        wx((x0 + x1) / 2),
        0,
        wz((y0 + y1) / 2),
      );
      s.castShadow = false;
      archFloor.add(s);
    });
    WALLS.forEach((w, i) => {
      if (state.demolished.includes('w' + i)) return;
      wallBox(w, 0, w[4] === 'low' ? Math.min(1, top) : top);
      colliders.push([wx(w[0]), wz(w[1]), wx(w[2]), wz(w[3])]);
    });
    // 门洞、飘窗洞口上方过梁
    (
      [
        ...DOORS.map((d) => [d.rect, 2.1]),
        ...SLIDES.map((s) => [s.rect, s.v ? 2.4 : 2.1]),
        [[10270, 800, 10510, 2600], 2.4],
        [[10270, 4260, 10510, 5740], 2.4],
      ] as [Rect, number][]
    ).forEach(([r, h]) => {
      if (top > h) wallBox(r, h, top);
    });
    WINS.forEach((r, i) => {
      const sill = i === 0 ? 1.4 : i >= 6 ? 0.45 : 0.9,
        head = 2.4;
      wallBox(r, 0, Math.min(sill, top));
      if (top > head) wallBox(r, head, top);
      colliders.push([wx(r[0]), wz(r[1]), wx(r[2]), wz(r[3])]);
      const gTop = Math.min(head, top);
      if (gTop <= sill) return;
      const [x0, y0, x1, y1] = r,
        hz = x1 - x0 >= y1 - y0,
        L = M(hz ? x1 - x0 : y1 - y0),
        gh = gTop - sill,
        cx = wx((x0 + x1) / 2),
        cz = wz((y0 + y1) / 2);
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(hz ? L : 0.01, gh, hz ? 0.01 : L),
        glassMat,
      );
      pane.position.set(cx, sill + gh / 2, cz);
      archUp.add(pane);
      const n = Math.max(1, Math.round(L / 0.9));
      for (let k = 0; k <= n; k++) {
        const t = -L / 2 + (k * L) / n,
          mu = new THREE.Mesh(
            new THREE.BoxGeometry(hz ? 0.04 : 0.06, gh, hz ? 0.06 : 0.04),
            frameMat,
          );
        mu.position.set(cx + (hz ? t : 0), sill + gh / 2, cz + (hz ? 0 : t));
        mu.castShadow = true;
        archUp.add(mu);
      }
      [sill + 0.02, gTop - 0.02].forEach((y) => {
        const tr = new THREE.Mesh(
          new THREE.BoxGeometry(hz ? L : 0.06, 0.04, hz ? 0.06 : L),
          frameMat,
        );
        tr.position.set(cx, y, cz);
        archUp.add(tr);
      });
    });
    DOORS.forEach((d) => {
      const pivot = new THREE.Group(),
        L = M(d.len),
        dh = Math.min(2.05, top);
      pivot.position.set(wx(d.h[0]), 0, wz(d.h[1]));
      const leaf = box(
        L,
        dh,
        0.04,
        mat(d.entry ? '#6b4f3a' : '#efe6d8', { roughness: 0.5 }),
        L / 2,
      );
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 12, 8),
        mat('#cfd2d4', { metalness: 0.9, roughness: 0.25 }),
      );
      knob.position.set(L - 0.07, Math.min(1, dh - 0.05), 0);
      knob.scale.z = 2.2;
      pivot.add(leaf, knob);
      const ang = (v: Point) => Math.atan2(-v[1], v[0]);
      const door: SceneDoor = {
        id: d.name,
        length: L,
        pivot,
        a0: ang(d.c),
        a1: ang(d.o),
        open: doorStates.get(d.name)?.open ?? true,
        cur: 0,
      };
      if (door.a1 - door.a0 > Math.PI) door.a1 -= Math.PI * 2;
      if (door.a0 - door.a1 > Math.PI) door.a1 += Math.PI * 2;
      door.cur = doorStates.get(d.name)?.cur ?? door.a1;
      pivot.rotation.y = door.cur;
      leaf.userData.door = knob.userData.door = door;
      doors.push(door);
      archUp.add(pivot);
    });
    SLIDES.forEach(({ rect: [x0, y0, x1, y1], v }) => {
      const L = M(v ? y1 - y0 : x1 - x0),
        ph = Math.min(v ? 2.4 : 2.1, top),
        pl = L * 0.55;
      [
        [-1, -0.02],
        [1, 0.02],
      ].forEach(([s, off]) => {
        const c = s < 0 ? -L / 2 + pl / 2 : L / 2 - pl / 2,
          x = v ? wx((x0 + x1) / 2) + off : wx(x0) + L / 2 + c,
          z = v ? wz(y0) + L / 2 + c : wz((y0 + y1) / 2) + off;
        const p = new THREE.Mesh(new THREE.BoxGeometry(v ? 0.02 : pl, ph, v ? pl : 0.02), glassMat);
        p.position.set(x, ph / 2, z);
        archUp.add(p);
        [ph - 0.03, 0.03].forEach((y) => {
          const fr = new THREE.Mesh(
            new THREE.BoxGeometry(v ? 0.04 : pl, 0.05, v ? pl : 0.04),
            frameMat,
          );
          fr.position.set(x, y, z);
          archUp.add(fr);
        });
        [-1, 1].forEach((e) => {
          const fr = new THREE.Mesh(new THREE.BoxGeometry(0.04, ph, 0.04), frameMat);
          fr.position.set(v ? x : x + (e * pl) / 2, ph / 2, v ? z + (e * pl) / 2 : z);
          archUp.add(fr);
        });
      });
    });
  }

  return {
    archFloor,
    archUp,
    lampG,
    doors,
    rebuild: buildArch,
    updateFloors() {
      const state = getState();
      ROOMS.forEach((r) => {
        const floor = floors.get(r.id);
        if (floor) {
          const m = floorMat(state.rooms[r.id]?.mat ?? r.mat);
          floor.material = r.counted === false ? [m, mat('#e9e4da')] : m;
        }
      });
    },
    updateMode() {
      archUp.traverse((o) => {
        if (o.userData.walkOnly) o.visible = opt.mode === 'walk';
      });
    },
    blocked(x: number, z: number, radius = 0.22) {
      for (const [x0, z0, x1, z1] of colliders)
        if (x > x0 - radius && x < x1 + radius && z > z0 - radius && z < z1 + radius) return true;
      for (const door of doors) {
        const a = door.pivot.rotation.y,
          px = door.pivot.position.x,
          pz = door.pivot.position.z;
        const dx = Math.cos(a) * door.length,
          dz = -Math.sin(a) * door.length;
        const t = THREE.MathUtils.clamp(
          ((x - px) * dx + (z - pz) * dz) / (dx * dx + dz * dz),
          0,
          1,
        );
        if (Math.hypot(x - px - t * dx, z - pz - t * dz) < radius * 0.8) return true;
      }
      return false;
    },
    dispose() {
      clearGroup(archFloor);
      clearGroup(archUp);
      clearGroup(lampG, true);
      edgeMat.dispose();
      skirtMat.dispose();
      floors.clear();
      doorStates.clear();
      doors.length = 0;
    },
  };
}
