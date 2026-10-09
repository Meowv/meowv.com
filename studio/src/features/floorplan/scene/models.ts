import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Furniture } from '../types';
export const OX = 6000,
  OY = 5300,
  H = 2.8;
export const wx = (x: number) => (x - OX) / 1000;
export const wz = (y: number) => (y - OY) / 1000;
export const M = (v: number) => v / 1000;
type Material = string | THREE.Material;
export function createModelFactory(renderer: THREE.WebGLRenderer, envTex: THREE.Texture) {
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfe6ef,
    roughness: 0.05,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  let envK = 1;
  function mat(color: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) {
    const key = color + JSON.stringify(o);
    if (!matCache.has(key)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
      // 金属 / 光滑表面挂环境反射，墙面等哑光材质不挂，避免整体变亮
      if (envTex && (m.metalness > 0 || m.roughness < 0.4)) {
        m.envMap = envTex;
        m.userData.env = m.metalness > 0.5 ? 1 : 0.5;
        m.envMapIntensity = m.userData.env * envK;
      }
      matCache.set(key, m);
    }
    return matCache.get(key)!;
  }
  function rng(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rgbK = (hex: string, k: number) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };
  // 地面贴图按真实尺寸平铺（UV 单位 = 米）
  const TEX: Record<
    string,
    { sx: number; sy: number; base: string; rough: number; grout?: string }
  > = {
    wood: { sx: 1.8, sy: 0.36, base: '#d6b58a', rough: 0.55 },
    walnut: { sx: 1.8, sy: 0.36, base: '#9a6f4b', rough: 0.5 },
    tile800: { sx: 0.8, sy: 0.8, base: '#ebe6dd', grout: '#cfc6b7', rough: 0.3 },
    tile600: { sx: 0.6, sy: 0.6, base: '#dfe3e0', grout: '#bfc6c1', rough: 0.35 },
    antislip: { sx: 0.3, sy: 0.3, base: '#d3d8d4', grout: '#aab2ac', rough: 0.8 },
    marble: { sx: 1.2, sy: 1.2, base: '#f2efe9', grout: '#d9d2c4', rough: 0.18 },
    terrazzo: { sx: 0.5, sy: 0.5, base: '#e6dfd3', rough: 0.4 },
    carpet: { sx: 0.3, sy: 0.3, base: '#c6bfd2', rough: 1 },
  };
  const floorMats: Record<string, THREE.MeshStandardMaterial> = {};
  function floorMat(kind: string) {
    if (floorMats[kind]) return floorMats[kind];
    const s = TEX[kind] || TEX.tile800,
      R = rng(kind.length * 977 + 13),
      cv = document.createElement('canvas');
    const wood = kind === 'wood' || kind === 'walnut';
    cv.width = wood ? 1024 : 512;
    cv.height = wood ? 205 : 512;
    const g = cv.getContext('2d')!,
      W = cv.width,
      Hh = cv.height;
    g.fillStyle = s.base;
    g.fillRect(0, 0, W, Hh);
    if (wood) {
      const rowH = Hh / 2,
        joints = [[(W * 2) / 3], [W / 3]];
      for (let r = 0; r < 2; r++) {
        let x0 = 0;
        [...joints[r], W].forEach((x1) => {
          g.fillStyle = rgbK(s.base, 0.9 + R() * 0.2);
          g.fillRect(x0, r * rowH, x1 - x0, rowH);
          g.strokeStyle = rgbK(s.base, 0.8);
          g.globalAlpha = 0.35;
          g.lineWidth = 1.2;
          for (let k = 0; k < 7; k++) {
            const y = r * rowH + 6 + R() * (rowH - 12);
            g.beginPath();
            g.moveTo(x0, y);
            for (let x = x0; x <= x1; x += 40) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 2.5);
            g.stroke();
          }
          g.globalAlpha = 1;
          g.fillStyle = rgbK(s.base, 0.62);
          g.fillRect(x1 - 1.5, r * rowH, 3, rowH);
          x0 = x1;
        });
        g.fillStyle = rgbK(s.base, 0.62);
        g.fillRect(0, r * rowH, W, 2.5);
      }
    } else if (kind === 'marble') {
      g.strokeStyle = 'rgba(160,150,135,.35)';
      for (let k = 0; k < 6; k++) {
        g.lineWidth = 1 + R() * 3;
        g.beginPath();
        g.moveTo(R() * W, 0);
        g.bezierCurveTo(R() * W, R() * Hh, R() * W, R() * Hh, R() * W, Hh);
        g.stroke();
      }
    } else if (kind === 'terrazzo') {
      const cs = ['#b9a58c', '#8fa3a0', '#c9b7a2', '#a88f76', '#7e8a86'];
      for (let k = 0; k < 160; k++) {
        g.fillStyle = cs[k % 5];
        g.beginPath();
        g.arc(R() * W, R() * Hh, 2 + R() * 7, 0, 7);
        g.fill();
      }
    } else {
      for (let k = 0; k < 1500; k++) {
        g.fillStyle = `rgba(0,0,0,${R() * 0.04})`;
        g.fillRect(R() * W, R() * Hh, 2, 2);
      }
    }
    if (s.grout) {
      g.fillStyle = s.grout;
      g.fillRect(0, 0, W, 3);
      g.fillRect(0, 0, 3, Hh);
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / s.sx, 1 / s.sy);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return (floorMats[kind] = new THREE.MeshStandardMaterial({ map: t, roughness: s.rough }));
  }

  /* ======================= 几何小工具（y = 底面高度） ======================= */
  const asMat = (m: Material) => (typeof m === 'string' ? mat(m) : m);
  const sh = <T extends THREE.Object3D>(o: T): T => {
    o.castShadow = o.receiveShadow = true;
    return o;
  };
  const mesh = (geo: THREE.BufferGeometry, m: Material) => sh(new THREE.Mesh(geo, asMat(m)));
  const rot = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0): T => {
    o.rotation.set(x, y, z);
    return o;
  };
  function box(w: number, h: number, d: number, m: Material, x = 0, y = 0, z = 0) {
    const o = mesh(
      new THREE.BoxGeometry(Math.max(0.002, w), Math.max(0.002, h), Math.max(0.002, d)),
      m,
    );
    o.position.set(x, y + h / 2, z);
    return o;
  }
  function rbox(w: number, h: number, d: number, m: Material, x = 0, y = 0, z = 0, r = 0.04) {
    const o = mesh(
      new RoundedBoxGeometry(
        Math.max(0.004, w),
        Math.max(0.004, h),
        Math.max(0.004, d),
        3,
        Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)),
      ),
      m,
    );
    o.position.set(x, y + h / 2, z);
    return o;
  }
  function cyl(rt: number, rb: number, h: number, m: Material, x = 0, y = 0, z = 0, seg = 28) {
    const o = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    o.position.set(x, y + h / 2, z);
    return o;
  }
  // 旋转体：pts = [[半径, 高度], …] 自下而上，y = 底面
  function lathe(pts: number[][], m: Material, x = 0, y = 0, z = 0, seg = 40) {
    const o = mesh(
      new THREE.LatheGeometry(
        pts.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h)),
        seg,
      ),
      m,
    );
    o.position.set(x, y, z);
    return o;
  }
  // 两点之间的圆杆，r0 在 a 端、r1 在 b 端（收分椅腿、斜撑）
  function rod(a: number[], b: number[], r0: number, m: Material, r1 = r0, seg = 12) {
    const A = new THREE.Vector3(...a),
      B = new THREE.Vector3(...b),
      o = mesh(new THREE.CylinderGeometry(r1, r0, A.distanceTo(B), seg), m);
    o.position.copy(A).add(B).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
    return o;
  }
  // 沿曲线的圆管（水龙头、扶手、灯臂）
  const tube = (pts: number[][], r: number, m: Material, seg = 40) =>
    mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          pts.map((p) => new THREE.Vector3(...p)),
          false,
          'centripetal',
        ),
        seg,
        r,
        10,
      ),
      m,
    );
  // 椭球（靠垫、叶片、豆袋），y = 中心
  function blob(rx: number, ry: number, rz: number, m: Material, x = 0, y = 0, z = 0, seg = 24) {
    const o = mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), m);
    o.scale.set(rx, ry, rz);
    o.position.set(x, y, z);
    return o;
  }
  // 水平圆环，y = 中心
  function ring(R: number, r: number, m: Material, x = 0, y = 0, z = 0) {
    const o = mesh(new THREE.TorusGeometry(R, r, 10, 48), m);
    o.rotation.x = Math.PI / 2;
    o.position.set(x, y, z);
    return o;
  }
  function rrect(w: number, d: number, r: number) {
    const s = new THREE.Shape(),
      x = -w / 2,
      y = -d / 2;
    w = Math.max(0.004, w);
    d = Math.max(0.004, d);
    r = Math.max(0.001, Math.min(r, w / 2 - 0.001, d / 2 - 0.001));
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r);
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d);
    s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  // 中空圆角框（浴缸、水槽沿、椅背框）：外 w×d、壁厚 t、高 h
  function shell(
    w: number,
    d: number,
    h: number,
    t: number,
    r: number,
    m: Material,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const s = rrect(w, d, r);
    s.holes.push(rrect(w - 2 * t, d - 2 * t, Math.max(0.004, r - t)));
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2);
    const o = mesh(geo, m);
    o.position.set(x, y, z);
    return o;
  }
  const darker = (hex: string, k = 0.8) =>
    '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
  const lighter = (hex: string, k = 0.2) =>
    '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();
  // 四条收分腿：inset 为距边距离，r 为腿底半径（顶部略粗）
  const legs = (
    g: THREE.Group,
    w: number,
    d: number,
    h: number,
    m: Material,
    inset = 0.05,
    r = 0.02,
  ) =>
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([a, b]) =>
      g.add(
        rod(
          [a * (w / 2 - inset), 0, b * (d / 2 - inset)],
          [a * (w / 2 - inset), h, b * (d / 2 - inset)],
          r * 0.7,
          m,
          r,
        ),
      ),
    );
  const metal = () => mat('#cfd2d4', { metalness: 0.9, roughness: 0.25 });
  const chrome = () => mat('#eef0f2', { metalness: 1, roughness: 0.08 });
  const hwMat = () => mat('#b9b3a8', { metalness: 0.85, roughness: 0.3 });
  const blackMetal = () => mat('#2b2b2d', { metalness: 0.6, roughness: 0.4 });
  const mirror = () => mat('#dfeaee', { metalness: 0.55, roughness: 0.06 });
  const ceramic = (o: THREE.MeshStandardMaterialParameters = {}) =>
    mat('#fbfbf9', { roughness: 0.12, ...o });
  const fabric = (c: string) => mat(c, { roughness: 0.96 });
  const woodM = (c: string) => mat(c, { roughness: 0.55 });
  const screenMat = (glow = '#1a2636') =>
    mat('#0b0e13', { roughness: 0.1, metalness: 0.3, emissive: glow, emissiveIntensity: 0.35 });
  const glowMat = (c = '#fff4dc', e = '#ffdca0', k = 0.5) =>
    mat(c, { emissive: e, emissiveIntensity: k, roughness: 0.9, side: THREE.DoubleSide });

  // 拉手：y 为拉手中心，z 为门板正面
  function pull(g: THREE.Group, len: number, vert: boolean, x: number, y: number, z: number) {
    const m = hwMat(),
      o = new THREE.Group();
    o.add(
      vert
        ? box(0.01, len, 0.01, m, 0, -len / 2, 0.028)
        : box(len, 0.01, 0.01, m, 0, -0.005, 0.028),
    );
    [-1, 1].forEach((s) =>
      o.add(
        vert
          ? box(0.008, 0.008, 0.028, m, 0, s * (len / 2 - 0.015) - 0.004, 0.014)
          : box(0.008, 0.008, 0.028, m, s * (len / 2 - 0.015), -0.004, 0.014),
      ),
    );
    o.position.set(x, y, z);
    g.add(o);
  }
  function knob(g: THREE.Group, x: number, y: number, z: number) {
    const k = cyl(0.011, 0.014, 0.02, hwMat(), x, y - 0.01, z + 0.01, 16);
    k.rotation.x = Math.PI / 2;
    g.add(k, blob(0.014, 0.014, 0.008, hwMat(), x, y, z + 0.022, 12));
  }
  // 柜门 / 抽屉面板：x0..x0+w、y0..y0+h 区域内 nx 列 × ny 行，正面朝 +z（z = 柜体正面）
  // hd：'bar' 金属拉手 | 'knob' 圆钮 | 'edge' 顶部隐形拉槽 | 'none'；hy：门拉手中心高度（null = 面板中部）
  function fronts(
    g: THREE.Group,
    x0: number,
    y0: number,
    w: number,
    h: number,
    z: number,
    nx: number,
    ny: number,
    m: Material,
    hd = 'bar',
    hy: number | null = null,
  ) {
    const gap = 0.005,
      pw = w / nx,
      ph = h / ny,
      fz = z + 0.018;
    g.add(box(w, h, 0.002, '#2a2724', x0 + w / 2, y0, z + 0.001)); // 缝隙里透出的暗色
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const cx = x0 + pw * (i + 0.5),
          yb = y0 + ph * j,
          drawer = ph < 0.4 && pw >= ph;
        g.add(rbox(pw - gap, ph - gap, 0.018, m, cx, yb + gap / 2, z + 0.009, 0.003));
        if (hd === 'none') continue;
        if (hd === 'edge') {
          g.add(box(pw - 0.05, 0.01, 0.006, '#3c3a37', cx, yb + ph - gap - 0.018, fz));
          continue;
        }
        if (drawer) {
          if (hd === 'knob') knob(g, cx, yb + ph / 2, fz);
          else pull(g, Math.min(0.3, pw * 0.45), false, cx, yb + ph / 2, fz);
          continue;
        }
        const len = Math.min(0.45, ph * 0.35),
          hx = nx === 1 ? cx + pw / 2 - 0.045 : i % 2 ? cx - pw / 2 + 0.04 : cx + pw / 2 - 0.04;
        const y = Math.min(
          yb + ph - 0.05 - len / 2,
          Math.max(yb + 0.05 + len / 2, hy ?? yb + ph / 2),
        );
        if (hd === 'knob') knob(g, hx, y, fz);
        else pull(g, len, true, hx, y, fz);
      }
  }
  const vasePts = (r: number, h: number) => [
    [0, 0],
    [r * 0.65, 0],
    [r, h * 0.32],
    [r * 0.92, h * 0.62],
    [r * 0.42, h * 0.86],
    [r * 0.5, h],
  ];
  function vase(
    g: THREE.Group,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    c: string,
    R: () => number,
    flowers = true,
  ) {
    g.add(lathe(vasePts(r, h), mat(c, { roughness: 0.35, side: THREE.DoubleSide }), x, y, z, 32));
    if (!flowers) return;
    const cols = ['#f3e6d8', '#e8b4a0', '#f6d27a', '#ffffff'];
    for (let k = 0; k < 5; k++) {
      const a = k * 1.26 + R() * 0.4,
        s = 0.03 + R() * 0.05,
        top = [x + Math.cos(a) * s, y + h + 0.12 + R() * 0.14, z + Math.sin(a) * s];
      g.add(
        rod([x, y + h * 0.6, z], top, 0.003, '#6f8f4a', 0.003, 6),
        blob(0.022, 0.018, 0.022, cols[k % 4], top[0], top[1], top[2], 12),
      );
    }
  }
  function tableLamp(g: THREE.Group, x: number, y: number, z: number, s = 1) {
    g.add(
      lathe(
        [
          [0, 0],
          [0.06 * s, 0],
          [0.075 * s, 0.05 * s],
          [0.08 * s, 0.12 * s],
          [0.055 * s, 0.2 * s],
          [0.018 * s, 0.25 * s],
          [0.012 * s, 0.3 * s],
        ],
        ceramic({ roughness: 0.3 }),
        x,
        y,
        z,
        32,
      ),
    );
    g.add(
      lathe(
        [
          [0.13 * s, 0],
          [0.1 * s, 0.18 * s],
        ],
        glowMat('#f6ecd9', '#ffdca0', 0.35),
        x,
        y + 0.26 * s,
        z,
        40,
      ),
      blob(0.03 * s, 0.03 * s, 0.03 * s, glowMat('#fff', '#ffe2b0', 1), x, y + 0.31 * s, z, 12),
    );
  }
  const plate = (g: THREE.Group, r: number, x: number, y: number, z: number) =>
    g.add(
      lathe(
        [
          [0, 0],
          [r * 0.6, 0],
          [r * 0.72, 0.008],
          [r, 0.02],
        ],
        ceramic({ side: THREE.DoubleSide }),
        x,
        y,
        z,
        32,
      ),
    );

  /* ======================= 家具模型（局部坐标：背面朝 -z） ======================= */
  function buildFurniture(f: Furniture) {
    const frameMat = mat('#5d6166', { roughness: 0.5, metalness: 0.4 });
    const g = new THREE.Group(),
      w = M(f.w),
      d = M(f.d),
      c = f.color || '#ddd',
      bz = -d / 2,
      R = rng([...f.id].reduce((seed, ch) => (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0, 17));
    switch (f.type) {
      case 'bed': {
        const fr = woodM('#8d7258'),
          fab = fabric(c),
          fh = 0.3,
          mt = 0.22,
          top = fh + mt,
          n = Math.max(3, Math.round(w / 0.28)),
          sw = (w - 0.04) / n;
        g.add(
          box(w - 0.12, 0.06, d - 0.14, '#4a3e33', 0, 0, 0.03),
          rbox(w, fh - 0.06, d - 0.08, fr, 0, 0.06, 0.04, 0.015),
        ); // 内缩踢脚 + 床箱
        g.add(rbox(w, 1.08, 0.06, fr, 0, 0, bz + 0.03, 0.012)); // 床头板
        for (let i = 0; i < n; i++)
          g.add(
            rbox(
              sw - 0.006,
              0.62,
              0.06,
              fabric(darker(c, 0.8)),
              -w / 2 + 0.02 + sw * (i + 0.5),
              0.42,
              bz + 0.08,
              0.025,
            ),
          ); // 竖向软包
        const md = d - 0.13,
          dd = md * 0.66,
          dz = d / 2 - 0.015 - dd / 2;
        g.add(rbox(w - 0.06, mt, md, '#f6f3ee', 0, fh, bz + 0.11 + md / 2, 0.07)); // 床垫
        g.add(
          rbox(w + 0.02, 0.27, dd, fab, 0, top - 0.2, dz, 0.04),
          rbox(w + 0.024, 0.06, 0.22, fabric('#fbfaf7'), 0, top + 0.025, dz - dd / 2 + 0.11, 0.025),
        ); // 被子 + 翻边
        g.add(
          rbox(w + 0.05, 0.285, 0.42, fabric(darker(c, 0.62)), 0, top - 0.205, d / 2 - 0.35, 0.03),
        ); // 床尾巾
        const np = w >= 1.3 ? 2 : 1,
          pw = (w - 0.16 - (np - 1) * 0.06) / np;
        for (let i = 0; i < np; i++) {
          const x = -w / 2 + 0.08 + pw / 2 + i * (pw + 0.06);
          g.add(
            rot(rbox(pw, 0.15, 0.42, fabric('#ffffff'), x, top - 0.01, bz + 0.34, 0.07), -0.28),
            rot(
              rbox(
                pw * 0.62,
                0.3,
                0.1,
                fabric(i ? '#efe7da' : darker(c, 0.7)),
                x,
                top,
                bz + 0.54,
                0.045,
              ),
              -0.3,
            ),
          );
        }
        break;
      }
      case 'sofa':
      case 'armchair': {
        const fab = fabric(c),
          dk = fabric(darker(c, 0.88)),
          a = Math.min(0.18, w * 0.14),
          n = f.type === 'armchair' ? 1 : w > 2.2 ? 3 : 2,
          cw = (w - 2 * a) / n,
          bd = Math.min(0.2, d * 0.24),
          lh = 0.12,
          sd = d - bd - 0.02;
        legs(g, w, d, lh, woodM('#3a3027'), 0.07, 0.018);
        g.add(
          rbox(w, 0.16, d, dk, 0, lh, 0, 0.03),
          rbox(w, 0.73, bd, dk, 0, lh, bz + bd / 2, 0.06),
        );
        [-1, 1].forEach((s) => g.add(rbox(a, 0.5, d, dk, s * (w / 2 - a / 2), lh, 0, 0.07)));
        for (let i = 0; i < n; i++) {
          const x = -w / 2 + a + cw / 2 + i * cw;
          g.add(
            rbox(cw - 0.012, 0.15, sd, fab, x, lh + 0.16, bz + bd + sd / 2, 0.055),
            rot(rbox(cw - 0.03, 0.44, 0.16, fab, x, lh + 0.3, bz + bd + 0.08, 0.07), -0.16),
          );
        }
        if (n > 1)
          [-1, 1].forEach((s) =>
            g.add(
              rot(
                rbox(
                  0.42,
                  0.42,
                  0.12,
                  fabric(s < 0 ? '#ece5d8' : darker(c, 0.7)),
                  s * (w / 2 - a - 0.26),
                  lh + 0.32,
                  bz + bd + 0.22,
                  0.06,
                ),
                -0.3,
                s * -0.25,
              ),
            ),
          );
        else
          g.add(
            rot(rbox(0.4, 0.26, 0.1, fabric('#ece5d8'), 0, lh + 0.33, bz + bd + 0.2, 0.05), -0.25),
          );
        break;
      }
      case 'cornersofa': {
        const k = Math.min(0.95, d * 0.56, w * 0.4),
          b = 0.2,
          fab = fabric(c),
          dk = fabric(darker(c, 0.88)),
          lh = 0.1,
          sw = (w - b - 0.2) / 2;
        [
          [-w / 2 + 0.07, bz + 0.07],
          [w / 2 - 0.07, bz + 0.07],
          [w / 2 - 0.07, bz + k - 0.07],
          [-w / 2 + 0.07, d / 2 - 0.07],
          [-w / 2 + k - 0.07, d / 2 - 0.07],
          [-w / 2 + k - 0.07, bz + k - 0.07],
        ].forEach(([x, z]) => g.add(rod([x, 0, z], [x, lh, z], 0.012, woodM('#3a3027'), 0.018)));
        g.add(
          rbox(w, 0.18, k, dk, 0, lh, bz + k / 2, 0.03),
          rbox(k, 0.18, d - k + 0.02, dk, -w / 2 + k / 2, lh, bz + k + (d - k) / 2 - 0.01, 0.03),
        );
        g.add(
          rbox(w, 0.72, b, dk, 0, lh, bz + b / 2, 0.06),
          rbox(b, 0.72, d, dk, -w / 2 + b / 2, lh, 0, 0.06),
          rbox(0.2, 0.5, k, dk, w / 2 - 0.1, lh, bz + k / 2, 0.07),
          rbox(k, 0.5, 0.2, dk, -w / 2 + k / 2, lh, d / 2 - 0.1, 0.07),
        );
        for (let i = 0; i < 2; i++) {
          const x = -w / 2 + b + sw / 2 + i * sw;
          g.add(
            rbox(sw - 0.012, 0.15, k - b - 0.02, fab, x, lh + 0.18, bz + b + (k - b) / 2, 0.055),
            rot(rbox(sw - 0.04, 0.42, 0.16, fab, x, lh + 0.3, bz + b + 0.07, 0.07), -0.16),
          );
        }
        g.add(
          rbox(
            k - b - 0.02,
            0.15,
            d - k - 0.22,
            fab,
            -w / 2 + b + (k - b) / 2,
            lh + 0.18,
            bz + k + (d - k - 0.2) / 2,
            0.055,
          ),
        );
        const L = d - 0.2 - b - 0.18,
          nl = Math.max(1, Math.round(L / 0.75));
        for (let i = 0; i < nl; i++)
          g.add(
            rot(
              rbox(
                0.16,
                0.42,
                L / nl - 0.03,
                fab,
                -w / 2 + b + 0.07,
                lh + 0.3,
                bz + b + 0.18 + (L / nl) * (i + 0.5),
                0.07,
              ),
              0,
              0,
              0.16,
            ),
          );
        g.add(
          rot(
            rbox(
              0.42,
              0.42,
              0.12,
              fabric('#ece5d8'),
              -w / 2 + b + 0.3,
              lh + 0.34,
              bz + b + 0.24,
              0.06,
            ),
            -0.35,
            0.6,
          ),
          rot(
            rbox(
              0.4,
              0.4,
              0.12,
              fabric(darker(c, 0.7)),
              w / 2 - 0.5,
              lh + 0.34,
              bz + b + 0.2,
              0.06,
            ),
            -0.3,
            -0.25,
          ),
        );
        break;
      }
      case 'nightstand': {
        const wm = woodM(c);
        legs(g, w, d, 0.1, woodM('#5a4a3b'), 0.04, 0.014);
        g.add(rbox(w, 0.4, d - 0.02, wm, 0, 0.1, -0.01, 0.012));
        fronts(g, -w / 2 + 0.02, 0.12, w - 0.04, 0.36, d / 2 - 0.02, 1, 2, wm, 'bar');
        tableLamp(g, -w * 0.12, 0.5, -d * 0.12);
        g.add(
          box(0.16, 0.025, 0.22, '#2f5d62', w * 0.24, 0.5, 0.04),
          box(0.14, 0.02, 0.2, '#e6dccd', w * 0.24, 0.525, 0.04),
        );
        break;
      }
      case 'wardrobe':
      case 'cabinet':
      case 'shoecab': {
        const cm = mat(c, { roughness: 0.55 }),
          fz = d / 2 - 0.02;
        if (f.type === 'wardrobe') {
          const h = 2.2,
            n = Math.max(1, Math.round(w / 0.5));
          g.add(
            box(w - 0.02, 0.08, d - 0.06, '#4a4641', 0, 0, -0.03),
            box(w, h - 0.08, d - 0.02, cm, 0, 0.08, -0.01),
          );
          fronts(g, -w / 2, 0.08, w, h - 0.1, fz, n, 1, cm, 'bar', 1.05);
          g.add(box(w, 0.02, d - 0.02, darker(c, 0.9), 0, h - 0.02, -0.01));
        } else if (f.type === 'shoecab') {
          const h = 1.0,
            y0 = 0.16,
            n = Math.max(1, Math.round(w / 0.45));
          g.add(
            box(w, h - y0, d - 0.02, cm, 0, y0, -0.01),
            box(w - 0.04, 0.01, 0.03, glowMat('#fff7e6', '#ffe9c4', 0.8), 0, y0 - 0.01, fz - 0.06),
          ); // 悬空 + 底部灯带
          fronts(g, -w / 2, y0, w, h - y0, fz, n, 1, cm, 'edge');
          g.add(rbox(w + 0.01, 0.025, d, woodM(darker(c, 0.8)), 0, h, 0, 0.006));
          g.add(rbox(0.22, 0.015, 0.14, woodM('#6b543f'), -w * 0.25, h + 0.025, 0, 0.006));
          vase(g, w * 0.28, h + 0.025, -0.03, 0.05, 0.2, '#d8cfc2', R);
        } else {
          const h = 0.85,
            n = Math.max(1, Math.round(w / 0.5));
          legs(g, w, d, 0.1, woodM('#3a3027'), 0.05, 0.016);
          g.add(box(w, h - 0.13, d - 0.02, cm, 0, 0.1, -0.01));
          fronts(g, -w / 2, 0.62, w, 0.2, fz, n, 1, cm, 'bar');
          fronts(g, -w / 2, 0.1, w, 0.52, fz, n, 1, cm, 'bar', 0.52);
          g.add(rbox(w + 0.02, 0.03, d + 0.01, woodM(darker(c, 0.78)), 0, h - 0.03, 0, 0.008));
          vase(g, w * 0.3, h, 0, 0.07, 0.24, '#e9e2d6', R);
          g.add(
            rot(box(0.3, 0.38, 0.02, woodM('#3a3027'), -w * 0.25, h, bz + 0.06), -0.12),
            rot(box(0.25, 0.33, 0.005, '#d9cfbf', -w * 0.25, h + 0.03, bz + 0.075), -0.12),
          ); // 靠墙画框
          g.add(
            lathe(
              [
                [0, 0],
                [0.05, 0],
                [0.12, 0.06],
                [0.13, 0.07],
              ],
              mat('#b8a58c', { roughness: 0.5, side: THREE.DoubleSide }),
              0,
              h,
              0.02,
              32,
            ),
          );
          for (let k = 0; k < 3; k++)
            g.add(
              blob(
                0.035,
                0.035,
                0.035,
                ['#d98c4a', '#c9ad4f', '#b5463a'][k],
                Math.cos(k * 2.1) * 0.04,
                h + 0.045,
                0.02 + Math.sin(k * 2.1) * 0.04,
                14,
              ),
            );
        }
        break;
      }
      case 'dresser': {
        const wm = woodM(c),
          r = Math.min(0.34, w * 0.3);
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].forEach(([a, b]) =>
          g.add(
            rod(
              [a * (w / 2 - 0.04), 0, b * (d / 2 - 0.04)],
              [a * (w / 2 - 0.05), 0.58, b * (d / 2 - 0.05)],
              0.012,
              wm,
              0.02,
            ),
          ),
        );
        g.add(box(w - 0.04, 0.14, d - 0.04, wm, 0, 0.58), rbox(w, 0.03, d, wm, 0, 0.72, 0, 0.008));
        fronts(g, -w / 2 + 0.03, 0.585, w - 0.06, 0.13, d / 2 - 0.02, 2, 1, wm, 'knob');
        const mr = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 12, 64), woodM(darker(c, 0.7)));
        mr.position.set(0, 0.77 + r, bz + 0.04);
        sh(mr);
        const mg = new THREE.Mesh(new THREE.CircleGeometry(r, 64), mirror());
        mg.position.set(0, 0.77 + r, bz + 0.035);
        g.add(mr, mg, box(0.08, 0.03, 0.06, woodM(darker(c, 0.7)), 0, 0.75, bz + 0.04));
        (
          [
            ['#e7c9b5', 0.03, 0.09],
            ['#b9d0d8', 0.025, 0.12],
            ['#f0e3cf', 0.02, 0.07],
          ] as [string, number, number][]
        ).forEach(([cc, rr, hh], i) =>
          g.add(
            cyl(
              rr,
              rr,
              hh,
              mat(cc, { roughness: 0.15, transparent: true, opacity: 0.8 }),
              w * 0.25 + i * 0.06,
              0.75,
              0.02,
            ),
          ),
        );
        g.add(rbox(0.16, 0.06, 0.1, woodM('#6b543f'), -w * 0.28, 0.75, 0.03, 0.01));
        const sz = d / 2 + 0.25;
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].forEach(([a, b]) =>
          g.add(rod([a * 0.13, 0, sz + b * 0.13], [a * 0.12, 0.4, sz + b * 0.12], 0.01, wm, 0.014)),
        );
        g.add(rbox(0.34, 0.08, 0.34, fabric('#e8ddd0'), 0, 0.4, sz, 0.035));
        break;
      }
      case 'desk': {
        const tm = woodM(c),
          bm = blackMetal();
        g.add(rbox(w, 0.025, d, tm, 0, 0.72, 0, 0.006));
        [-1, 1].forEach((s) => {
          const x = s * (w / 2 - 0.06);
          g.add(
            box(0.03, 0.72, 0.03, bm, x, 0, d / 2 - 0.06),
            box(0.03, 0.72, 0.03, bm, x, 0, bz + 0.06),
            box(0.03, 0.03, d - 0.1, bm, x, 0, 0),
            box(0.03, 0.03, d - 0.1, bm, x, 0.69, 0),
          );
        });
        g.add(
          box(w - 0.12, 0.04, 0.015, bm, 0, 0.66, bz + 0.06),
          box(0.4, 0.09, d - 0.12, tm, w / 2 - 0.32, 0.63, 0),
        );
        pull(g, 0.16, false, w / 2 - 0.32, 0.675, d / 2 - 0.06);
        const my = 0.745,
          mz = bz + 0.15;
        g.add(
          rbox(0.22, 0.012, 0.16, bm, 0, my, mz, 0.004),
          rod([0, my, mz - 0.02], [0, my + 0.2, mz - 0.03], 0.012, bm),
        );
        g.add(
          rbox(0.62, 0.37, 0.02, '#1d1d1f', 0, my + 0.12, mz - 0.04, 0.006),
          box(0.6, 0.33, 0.002, screenMat('#27405c'), 0, my + 0.15, mz - 0.029),
        );
        g.add(
          rbox(0.42, 0.015, 0.13, '#e8e8ea', 0, my, 0.06, 0.004),
          rbox(0.4, 0.004, 0.11, '#d2d2d6', 0, my + 0.014, 0.06, 0.002),
          blob(0.03, 0.015, 0.05, '#e8e8ea', 0.3, my + 0.012, 0.07, 16),
        );
        const lx = -w / 2 + 0.15,
          lz = bz + 0.12;
        g.add(
          cyl(0.07, 0.075, 0.02, bm, lx, my, lz, 28),
          tube(
            [
              [lx, my + 0.02, lz],
              [lx, my + 0.3, lz + 0.03],
              [lx + 0.12, my + 0.42, lz + 0.1],
            ],
            0.008,
            bm,
          ),
        );
        const hd = cyl(0.02, 0.06, 0.1, bm, lx + 0.14, my + 0.34, lz + 0.12, 24);
        hd.rotation.x = 0.5;
        g.add(hd);
        g.add(
          cyl(0.04, 0.038, 0.09, ceramic({ roughness: 0.3 }), w / 2 - 0.15, my, 0.05, 20),
          rbox(0.2, 0.015, 0.28, '#3b5566', -w / 2 + 0.3, my, 0.1, 0.004),
        );
        break;
      }
      case 'chair': {
        const lw = woodM('#6b543f'),
          fab = fabric(c),
          sy = 0.44;
        [
          [-1, 1],
          [1, 1],
        ].forEach(([s]) =>
          g.add(
            rod(
              [s * (w / 2 - 0.04), 0, d / 2 - 0.05],
              [s * (w / 2 - 0.05), sy, d / 2 - 0.07],
              0.012,
              lw,
              0.018,
            ),
          ),
        );
        [-1, 1].forEach((s) =>
          g.add(
            rod(
              [s * (w / 2 - 0.04), 0, bz + 0.03],
              [s * (w / 2 - 0.05), 0.86, bz + 0.07],
              0.012,
              lw,
              0.018,
            ),
          ),
        );
        g.add(
          box(w - 0.08, 0.025, 0.02, lw, 0, 0.15, d / 2 - 0.06),
          box(w - 0.08, 0.025, 0.02, lw, 0, 0.15, bz + 0.05),
        );
        [-1, 1].forEach((s) => g.add(box(0.02, 0.025, d - 0.12, lw, s * (w / 2 - 0.045), 0.18, 0)));
        g.add(
          box(w - 0.06, 0.04, d - 0.1, lw, 0, sy - 0.03, 0),
          rbox(w - 0.04, 0.05, d - 0.08, fab, 0, sy, 0.005, 0.022),
        );
        g.add(
          rot(rbox(w - 0.08, 0.15, 0.025, lw, 0, 0.66, bz + 0.065, 0.012), -0.12),
          rot(box(w - 0.08, 0.025, 0.02, lw, 0, 0.52, bz + 0.055), -0.12),
        );
        break;
      }
      case 'bookshelf': {
        const h = 1.8,
          t = 0.022,
          ns = 5,
          wm = woodM(c),
          sh0 = (h - 0.06 - t) / ns,
          cols = [
            '#b88a6a',
            '#6f8f8a',
            '#d9c08c',
            '#9aa58c',
            '#a8675e',
            '#e6dccd',
            '#7d8ea3',
            '#c9bfae',
          ];
        g.add(
          box(w, h, 0.012, woodM(darker(c, 0.85)), 0, 0, bz + 0.006),
          box(t, h, d, wm, -w / 2 + t / 2),
          box(t, h, d, wm, w / 2 - t / 2),
          box(w - 2 * t, 0.06, d - 0.03, wm, 0, 0, 0.0),
        );
        for (let s = 0; s <= ns; s++) {
          const y = s < ns ? 0.06 + s * sh0 : h - t;
          g.add(box(w - 2 * t, t, d - 0.012, wm, 0, y, 0.006));
          if (s === ns) break;
          const yb = y + t,
            end = w / 2 - t - 0.01;
          let x = -w / 2 + t + 0.01,
            deco = R() < 0.55 ? x + R() * (w - 0.45) : 99;
          while (x < end - 0.03) {
            if (x >= deco) {
              deco = 99;
              if (R() < 0.5)
                vase(g, x + 0.07, yb, 0, 0.045, 0.16, cols[Math.floor(R() * 8)], R, false);
              else
                for (let k = 0; k < 3; k++)
                  g.add(
                    box(
                      0.2 - k * 0.02,
                      0.028,
                      d * 0.7,
                      mat(cols[Math.floor(R() * 8)], { roughness: 0.8 }),
                      x + 0.1,
                      yb + k * 0.028,
                      0.01,
                    ),
                  );
              x += 0.2;
              continue;
            }
            if (R() < 0.07) {
              x += 0.03 + R() * 0.05;
              continue;
            }
            const bw = 0.018 + R() * 0.03,
              bh = Math.min(sh0 - t - 0.03, 0.17 + R() * 0.13),
              bd = d * (0.62 + R() * 0.22);
            if (x + bw > end) break;
            g.add(
              box(
                bw,
                bh,
                bd,
                mat(cols[Math.floor(R() * 8)], { roughness: 0.75 }),
                x + bw / 2,
                yb,
                d / 2 - 0.015 - bd / 2,
              ),
            );
            x += bw + 0.002;
          }
        }
        break;
      }
      case 'baycushion':
        g.add(rbox(w, 0.08, d, fabric(c), 0, 0.45, 0, 0.03));
        g.add(
          rot(rbox(w - 0.1, 0.34, 0.14, fabric('#ffffff'), 0, 0.52, bz + 0.14, 0.06), 0.25),
          rot(rbox(w - 0.1, 0.34, 0.14, fabric('#f0e6d6'), 0, 0.52, d / 2 - 0.14, 0.06), -0.25),
        );
        g.add(
          rbox(w * 0.8, 0.04, 0.3, fabric(darker(c, 0.7)), 0, 0.53, d * 0.12, 0.02),
          rbox(0.28, 0.015, 0.2, woodM('#8d7258'), 0, 0.53, -d * 0.15, 0.006),
          cyl(0.035, 0.03, 0.06, ceramic(), 0, 0.545, -d * 0.15, 20),
        );
        break;
      case 'coffeetable': {
        const tm = mat(c, { roughness: 0.35 }),
          lw = woodM('#3a3027');
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].forEach(([a, b]) =>
          g.add(
            rod(
              [a * (w / 2 - 0.05), 0, b * (d / 2 - 0.05)],
              [a * (w / 2 - 0.07), 0.365, b * (d / 2 - 0.07)],
              0.012,
              lw,
              0.02,
            ),
          ),
        );
        g.add(
          rbox(w, 0.035, d, tm, 0, 0.365, 0, 0.015),
          rbox(w - 0.12, 0.02, d - 0.12, woodM(darker(c, 0.85)), 0, 0.12, 0, 0.006),
        );
        g.add(
          box(0.3, 0.03, 0.22, '#2f5d62', w * 0.2, 0.14, 0),
          box(0.26, 0.025, 0.19, '#d9b36c', w * 0.2, 0.17, 0.01),
        );
        g.add(
          rbox(0.38, 0.015, 0.24, woodM('#6b543f'), -w * 0.2, 0.4, 0, 0.006),
          box(0.22, 0.025, 0.16, '#e6dccd', -w * 0.22, 0.415, 0),
        );
        g.add(
          lathe(
            [
              [0, 0],
              [0.025, 0],
              [0.035, 0.07],
              [0.034, 0.08],
            ],
            ceramic({ side: THREE.DoubleSide }),
            -w * 0.12,
            0.415,
            0.06,
            20,
          ),
        );
        vase(g, w * 0.24, 0.4, -0.05, 0.055, 0.18, '#e9e2d6', R);
        break;
      }
      case 'tvstand': {
        const sm = mat(c, { roughness: 0.5 }),
          n = Math.max(2, Math.round(w / 0.6));
        legs(g, w, d, 0.1, blackMetal(), 0.08, 0.012);
        g.add(rbox(w, 0.4, d - 0.02, sm, 0, 0.1, -0.01, 0.01));
        fronts(g, -w / 2 + 0.005, 0.105, w - 0.01, 0.39, d / 2 - 0.02, n, 1, sm, 'edge');
        g.add(
          rbox(
            1.45,
            0.84,
            0.025,
            mat('#18181a', { roughness: 0.4, metalness: 0.3 }),
            0,
            0.95,
            bz + 0.03,
            0.004,
          ),
          box(1.43, 0.81, 0.002, screenMat(), 0, 0.962, bz + 0.0435),
        );
        g.add(
          rbox(0.9, 0.06, 0.09, '#2a2a2c', 0, 0.5, -0.02, 0.02),
          box(0.86, 0.045, 0.002, fabric('#3a3a3c'), 0, 0.507, 0.026),
        );
        vase(g, w / 2 - 0.25, 0.5, 0, 0.06, 0.26, '#d8cfc2', R);
        g.add(
          box(0.25, 0.035, 0.18, '#a9433b', -w / 2 + 0.3, 0.5, 0),
          box(0.22, 0.03, 0.16, '#e6dccd', -w / 2 + 0.3, 0.535, 0),
        );
        break;
      }
      case 'rug':
        (
          [
            [w, d, 0.01, c, 0],
            [w - 0.16, d - 0.16, 0.002, darker(c, 0.82), 0.01],
            [w - 0.26, d - 0.26, 0.002, lighter(c, 0.12), 0.0115],
          ] as [number, number, number, string, number][]
        ).forEach(([a, b, h, cc, y]) => {
          const r = box(a, h, b, mat(cc, { roughness: 1 }), 0, y + 0.002);
          r.castShadow = false;
          g.add(r);
        });
        break;
      case 'plant': {
        const r = Math.min(w, d) / 2,
          H = 0.9 + r * 1.6,
          pot = mat('#d9d2c5', { roughness: 0.6 }),
          lm = [
            mat('#5f8f4e', { roughness: 0.6, side: THREE.DoubleSide }),
            mat('#79a862', { roughness: 0.6, side: THREE.DoubleSide }),
          ];
        g.add(
          lathe(
            [
              [0, 0],
              [r * 0.4, 0],
              [r * 0.44, 0.02],
              [r * 0.54, 0.36],
              [r * 0.57, 0.4],
              [r * 0.52, 0.4],
              [r * 0.5, 0.37],
              [0, 0.37],
            ],
            pot,
            0,
            0,
            0,
            36,
          ),
          cyl(r * 0.49, r * 0.49, 0.005, '#4a3a2c', 0, 0.368, 0, 28),
        );
        g.add(rod([0, 0.37, 0], [0.02, H * 0.62, -0.01], 0.016, '#6b5540', 0.009));
        const N = 20 + Math.round(r * 36),
          sc = Math.sqrt(r / 0.25);
        for (let k = 0; k < N; k++) {
          const t = k / N,
            a = k * 2.399 + R() * 0.3,
            len = (0.14 + R() * 0.08) * (1.1 - t * 0.4) * sc,
            s0 = 0.03 + R() * 0.08 * sc,
            p = new THREE.Group();
          p.position.set(0, H * (0.42 + 0.58 * t), 0);
          p.rotation.set(0, -a, 0.1 + t * 0.5 + R() * 0.3, 'YXZ');
          const lf = blob(len / 2, 0.005, len * 0.27, lm[k % 2], s0 + len / 2, 0, 0, 16);
          lf.rotation.z = -0.3;
          p.add(box(s0, 0.005, 0.005, '#6f8f4a', s0 / 2, 0, 0), lf);
          g.add(p);
        }
        break;
      }
      case 'table': {
        const tm = mat(c, { roughness: 0.4 }),
          lw = woodM(darker(c, 0.55)),
          ns = Math.max(1, Math.round(w / 0.62)),
          top = 0.75;
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].forEach(([a, b]) =>
          g.add(
            rod(
              [a * (w / 2 - 0.08), 0, b * (d / 2 - 0.08)],
              [a * (w / 2 - 0.1), 0.715, b * (d / 2 - 0.1)],
              0.016,
              lw,
              0.026,
            ),
          ),
        );
        g.add(
          rbox(w, 0.035, d, tm, 0, 0.715, 0, 0.012),
          box(w - 0.22, 0.07, d - 0.22, lw, 0, 0.645),
        );
        g.add(box(w * 0.7, 0.003, 0.32, fabric('#b9a58c'), 0, top, 0));
        for (let i = 0; i < ns; i++)
          [-1, 1].forEach((s) => {
            const x = -w / 2 + (w / ns) * (i + 0.5),
              z = s * (d / 2 - 0.17);
            g.add(box(0.38, 0.003, 0.28, fabric('#e7dfd1'), x, top, z));
            plate(g, 0.12, x, top + 0.003, z);
            g.add(
              cyl(
                0.03,
                0.026,
                0.1,
                mat('#dfeef3', { transparent: true, opacity: 0.35, roughness: 0.05 }),
                x + 0.15,
                top + 0.003,
                z - s * 0.1,
                16,
              ),
            );
          });
        vase(g, 0, top + 0.003, 0, 0.06, 0.2, '#e9e2d6', R);
        break;
      }
      case 'roundtable': {
        const b = Math.min(0.25, w * 0.3),
          lw = woodM('#4a3e33'),
          top = 0.75;
        g.add(
          lathe(
            [
              [b, 0],
              [b, 0.015],
              [b * 0.8, 0.035],
              [0.06, 0.12],
              [0.045, 0.35],
              [0.05, 0.6],
              [0.12, 0.69],
              [0.18, 0.715],
            ],
            lw,
            0,
            0,
            0,
            40,
          ),
          cyl(w / 2, w / 2, 0.035, mat(c, { roughness: 0.4 }), 0, 0.715, 0, 64),
        );
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2 + 0.4,
            rr = w / 2 - 0.17;
          plate(g, 0.11, Math.cos(a) * rr, top, Math.sin(a) * rr);
        }
        vase(g, 0, top, 0, 0.05, 0.18, '#e9e2d6', R);
        break;
      }
      case 'counter': {
        const cm = mat(c, { roughness: 0.45 }),
          stone = mat('#dcd7cf', { roughness: 0.22 }),
          n = Math.max(1, Math.round(w / 0.6)),
          fz = d / 2 - 0.04;
        g.add(
          box(w - 0.01, 0.1, d - 0.1, '#4a4641', 0, 0, -0.05),
          box(w, 0.72, d - 0.04, cm, 0, 0.1, -0.02),
        );
        fronts(g, -w / 2, 0.64, w, 0.18, fz, n, 1, cm, 'bar');
        fronts(g, -w / 2, 0.1, w, 0.54, fz, n, 1, cm, 'bar', 0.56);
        g.add(
          rbox(w + 0.01, 0.04, d, stone, 0, 0.82, 0, 0.004),
          box(w, 0.62, 0.01, mat('#efece6', { roughness: 0.3 }), 0, 0.86, bz + 0.005),
        );
        g.add(box(w, 0.7, 0.33, cm, 0, 1.48, bz + 0.165));
        fronts(g, -w / 2, 1.48, w, 0.7, bz + 0.33, n, 1, cm, 'bar', 1.56);
        g.add(box(w - 0.04, 0.01, 0.02, glowMat('#fff7e6', '#ffe9c4', 0.8), 0, 1.47, bz + 0.29));
        if (w >= 0.8) {
          g.add(rbox(0.36, 0.018, 0.25, woodM('#c9a27a'), -w / 2 + 0.3, 0.86, 0.0, 0.005));
          [0.07, 0.06, 0.05].forEach((r, i) =>
            g.add(
              cyl(
                r,
                r,
                0.16 - i * 0.03,
                mat(['#e9e2d6', '#d6cfc3', '#bfb6a8'][i], { roughness: 0.4 }),
                w / 2 - 0.15 - i * 0.15,
                0.86,
                bz + 0.1,
                24,
              ),
            ),
          );
          g.add(
            cyl(0.05, 0.045, 0.14, ceramic({ roughness: 0.3 }), w / 2 - 0.6, 0.86, bz + 0.1, 20),
          );
          for (let k = 0; k < 4; k++)
            g.add(
              rod(
                [w / 2 - 0.6, 0.9, bz + 0.1],
                [w / 2 - 0.6 + (k - 1.5) * 0.018, 1.1, bz + 0.1 + ((k % 2) - 0.5) * 0.02],
                0.005,
                woodM('#8d7258'),
                0.006,
                6,
              ),
            );
        }
        break;
      }
      case 'stove': {
        const sm = mat('#b9bec3', { metalness: 0.8, roughness: 0.3 });
        g.add(
          rbox(
            w,
            0.012,
            d,
            mat('#0d0d0e', { roughness: 0.06, metalness: 0.3 }),
            0,
            0.862,
            0,
            0.004,
          ),
        );
        (w / d > 1.4
          ? [
              [-w / 4, 0],
              [w / 4, 0],
            ]
          : [
              [-w / 4, -d / 4],
              [w / 4, -d / 4],
              [-w / 4, d / 4],
              [w / 4, d / 4],
            ]
        ).forEach(([x, z]) => {
          g.add(
            cyl(0.085, 0.09, 0.008, '#2b2b2b', x, 0.874, z, 32),
            cyl(
              0.045,
              0.05,
              0.014,
              mat('#6b5a45', { metalness: 0.7, roughness: 0.35 }),
              x,
              0.874,
              z,
              28,
            ),
            cyl(0.028, 0.028, 0.022, '#1a1a1a', x, 0.874, z, 20),
          );
          for (let k = 0; k < 5; k++) {
            const a = (k * Math.PI * 2) / 5;
            g.add(
              rot(
                box(
                  0.07,
                  0.014,
                  0.012,
                  '#1c1c1c',
                  x + Math.cos(a) * 0.1,
                  0.874,
                  z + Math.sin(a) * 0.1,
                ),
                0,
                -a,
              ),
            );
          }
          g.add(cyl(0.02, 0.022, 0.018, '#222', x, 0.874, d / 2 - 0.04, 20));
        });
        g.add(
          rbox(w, 0.06, 0.5, sm, 0, 1.55, bz + 0.25, 0.01),
          box(0.3, 0.72, 0.26, sm, 0, 1.61, bz + 0.13),
        );
        g.add(
          rot(
            box(
              w - 0.02,
              0.3,
              0.008,
              mat('#15181b', { roughness: 0.05, metalness: 0.5 }),
              0,
              1.58,
              bz + 0.38,
            ),
            -0.9,
          ),
          box(
            0.16,
            0.012,
            0.003,
            mat('#101214', { emissive: '#6fd0ff', emissiveIntensity: 0.6 }),
            0,
            1.575,
            bz + 0.502,
          ),
        );
        break;
      }
      case 'ksink': {
        const st = mat('#c7ccd1', { metalness: 0.85, roughness: 0.28 }),
          inner = mat('#9aa1a8', { metalness: 0.8, roughness: 0.35 }),
          two = w >= 0.75,
          bw = two ? w * 0.42 : w * 0.7,
          bd = d * 0.66;
        g.add(box(w, 0.008, d, st, 0, 0.862, 0));
        (two ? [-w * 0.23, w * 0.23] : [0]).forEach((x) =>
          g.add(
            shell(bw, bd, 0.02, 0.015, 0.04, st, x, 0.862, 0.03),
            box(bw - 0.03, 0.002, bd - 0.03, inner, x, 0.87, 0.03),
            cyl(0.03, 0.03, 0.003, chrome(), x, 0.872, 0.03, 20),
          ),
        );
        const fx = two ? 0 : w * 0.3,
          cm = chrome();
        g.add(
          cyl(0.025, 0.028, 0.03, cm, fx, 0.87, bz + 0.06, 20),
          tube(
            [
              [fx, 0.9, bz + 0.06],
              [fx, 1.12, bz + 0.06],
              [fx, 1.17, bz + 0.1],
              [fx, 1.14, bz + 0.18],
              [fx, 1.08, bz + 0.2],
            ],
            0.012,
            cm,
          ),
        );
        g.add(rot(box(0.012, 0.012, 0.09, cm, fx + 0.035, 0.98, bz + 0.09), -0.3));
        break;
      }
      case 'fridge': {
        const fm = mat(c, { metalness: 0.45, roughness: 0.28 }),
          h = 1.8,
          fz = d / 2 - 0.05;
        g.add(
          box(w - 0.02, 0.06, d - 0.06, '#2a2c2e', 0, 0, -0.03),
          rbox(w, h - 0.06, d - 0.05, fm, 0, 0.06, -0.025, 0.02),
          box(w - 0.01, h - 0.07, 0.003, '#2a2c2e', 0, 0.065, fz + 0.0015),
        );
        if (w > 0.85) {
          [-1, 1].forEach((s) => {
            g.add(rbox(w / 2 - 0.004, h - 0.08, 0.04, fm, (s * w) / 4, 0.07, fz + 0.023, 0.012));
            pull(g, 0.8, true, s * 0.035, 1.05, fz + 0.043);
          });
          g.add(box(0.1, 0.14, 0.003, screenMat('#2a6f8f'), -w / 4, 1.25, fz + 0.044));
        } else {
          g.add(
            rbox(w - 0.006, 1.06, 0.04, fm, 0, 0.72, fz + 0.023, 0.012),
            rbox(w - 0.006, 0.64, 0.04, fm, 0, 0.07, fz + 0.023, 0.012),
          );
          pull(g, 0.5, true, -w / 2 + 0.06, 1.05, fz + 0.043);
          pull(g, w * 0.5, false, 0, 0.64, fz + 0.043);
          g.add(box(0.08, 0.1, 0.003, screenMat('#2a6f8f'), w * 0.22, 1.4, fz + 0.044));
        }
        break;
      }
      case 'toilet': {
        const cer = ceramic(),
          Rb = w * 0.45,
          zc = bz + d * 0.62,
          kz = (d * 0.37) / Rb,
          cm = chrome();
        g.add(
          rbox(w * 0.88, 0.4, d * 0.24, cer, 0, 0.36, bz + d * 0.12, 0.04),
          rbox(w * 0.92, 0.03, d * 0.27, cer, 0, 0.76, bz + d * 0.135, 0.012),
          cyl(0.022, 0.022, 0.006, cm, 0, 0.79, bz + d * 0.135, 20),
        );
        const ped = lathe(
          [
            [0, 0],
            [Rb * 0.62, 0],
            [Rb * 0.66, 0.02],
            [Rb * 0.56, 0.12],
            [Rb * 0.62, 0.22],
            [Rb * 0.92, 0.33],
            [Rb, 0.37],
          ],
          cer,
          0,
          0,
          zc,
          40,
        );
        const seat = cyl(
            Rb * 1.01,
            Rb * 1.01,
            0.022,
            mat('#f4f4f2', { roughness: 0.2 }),
            0,
            0.37,
            zc,
            40,
          ),
          lid = cyl(
            Rb * 0.97,
            Rb * 0.99,
            0.02,
            mat('#f4f4f2', { roughness: 0.2 }),
            0,
            0.392,
            zc,
            40,
          );
        ped.scale.z = seat.scale.z = lid.scale.z = kz;
        g.add(ped, seat, lid);
        [-1, 1].forEach((s) =>
          g.add(box(0.03, 0.02, 0.03, cm, s * w * 0.18, 0.39, zc - Rb * kz - 0.005)),
        );
        break;
      }
      case 'vanity': {
        const vm = mat(c, { roughness: 0.5 }),
          stone = mat('#fafafa', { roughness: 0.18 }),
          nb = w >= 1.1 ? 2 : 1,
          cd = d - 0.04,
          cm = chrome();
        g.add(rbox(w, 0.45, cd, vm, 0, 0.33, bz + cd / 2, 0.008));
        fronts(g, -w / 2 + 0.005, 0.335, w - 0.01, 0.44, d / 2 - 0.04, nb, 2, vm, 'edge');
        g.add(rbox(w, 0.03, d, stone, 0, 0.78, 0, 0.006));
        const rb = Math.min(0.19, (w / nb) * 0.36);
        for (let i = 0; i < nb; i++) {
          const x = nb === 1 ? 0 : i ? w / 4 : -w / 4;
          g.add(
            lathe(
              [
                [0, 0],
                [rb * 0.55, 0],
                [rb * 0.85, 0.03],
                [rb, 0.1],
                [rb * 0.97, 0.12],
              ],
              ceramic({ side: THREE.DoubleSide }),
              x,
              0.81,
              0.03,
              40,
            ),
            cyl(0.018, 0.018, 0.003, cm, x, 0.812, 0.03, 16),
          );
          g.add(
            cyl(0.02, 0.022, 0.02, cm, x, 0.81, bz + 0.06, 16),
            tube(
              [
                [x, 0.83, bz + 0.06],
                [x, 1.03, bz + 0.06],
                [x, 1.07, bz + 0.11],
                [x, 1.03, bz + 0.15],
              ],
              0.01,
              cm,
            ),
            rot(box(0.01, 0.01, 0.06, cm, x, 1.05, bz + 0.04), 0.4),
          );
        }
        const mw = Math.min(w * 0.9, nb * 0.7);
        g.add(
          rbox(mw + 0.02, 0.82, 0.02, glowMat('#fff7e6', '#ffe9c4', 0.9), 0, 1.14, bz + 0.01, 0.01),
          box(mw, 0.8, 0.01, mirror(), 0, 1.15, bz + 0.025),
        );
        g.add(
          cyl(
            0.028,
            0.028,
            0.12,
            mat('#c8b8a6', { roughness: 0.3 }),
            w / 2 - 0.08,
            0.81,
            bz + 0.1,
            16,
          ),
          rbox(0.18, 0.03, 0.12, fabric('#e9e2d6'), -w / 2 + 0.12, 0.81, 0.05, 0.012),
        );
        break;
      }
      case 'shower': {
        const cm = chrome(),
          x = -w / 4;
        g.add(
          rbox(w, 0.05, d, mat('#f4f4f2', { roughness: 0.3 }), 0, 0, 0, 0.01),
          box(
            w * 0.6,
            0.003,
            0.05,
            mat('#9aa1a8', { metalness: 0.8, roughness: 0.3 }),
            0,
            0.05,
            bz + 0.08,
          ),
        );
        [
          [w, 0.01, 0, d / 2 - 0.005],
          [0.01, d, w / 2 - 0.005, 0],
        ].forEach(([gw, gd, px, pz]) => {
          const p = box(gw, 1.95, gd, glassMat, px, 0.05, pz);
          p.castShadow = false;
          g.add(p);
        });
        g.add(
          box(0.02, 1.95, 0.02, frameMat, w / 2 - 0.01, 0.05, d / 2 - 0.01),
          box(0.02, 1.95, 0.03, frameMat, -w / 2 + 0.01, 0.05, d / 2 - 0.005),
          box(0.03, 1.95, 0.02, frameMat, w / 2 - 0.005, 0.05, bz + 0.01),
        );
        g.add(
          box(w, 0.015, 0.02, frameMat, 0, 1.985, d / 2 - 0.005),
          box(0.02, 0.015, d, frameMat, w / 2 - 0.005, 1.985, 0),
        );
        g.add(
          rbox(0.14, 0.1, 0.04, cm, x, 1.0, bz + 0.02, 0.01),
          rod([x, 1.1, bz + 0.03], [x, 1.95, bz + 0.03], 0.012, cm),
        );
        g.add(
          tube(
            [
              [x, 1.95, bz + 0.03],
              [x, 2.02, bz + 0.06],
              [x, 2.03, bz + 0.22],
            ],
            0.01,
            cm,
          ),
          rbox(0.24, 0.012, 0.24, cm, x, 2.02, bz + 0.25, 0.004),
        );
        g.add(
          rot(cyl(0.015, 0.02, 0.2, cm, x + 0.1, 1.25, bz + 0.05, 16), 0.25),
          blob(0.03, 0.012, 0.03, cm, x + 0.1, 1.47, bz + 0.08, 16),
        );
        g.add(box(0.26, 0.012, 0.1, ceramic(), w / 2 - 0.2, 1.2, bz + 0.05));
        (
          [
            ['#e6dccd', 0.03, 0.18],
            ['#2f5d62', 0.025, 0.15],
            ['#f4f4f2', 0.028, 0.12],
          ] as [string, number, number][]
        ).forEach(([cc, r, hh], i) =>
          g.add(
            cyl(
              r,
              r,
              hh,
              mat(cc, { roughness: 0.3 }),
              w / 2 - 0.28 + i * 0.07,
              1.212,
              bz + 0.05,
              16,
            ),
          ),
        );
        break;
      }
      case 'bathtub': {
        const cer = ceramic(),
          h = 0.56,
          t = 0.07,
          cm = chrome();
        g.add(
          shell(w, d, h, t, 0.14, cer),
          box(w - 0.1, 0.12, d - 0.1, cer, 0, 0, 0),
          box(
            w - 2 * t + 0.004,
            0.004,
            d - 2 * t + 0.004,
            mat('#bfe0ea', { roughness: 0.03, transparent: true, opacity: 0.6 }),
            0,
            0.4,
            0,
          ),
        );
        const fx = w / 2 - t / 2;
        g.add(
          tube(
            [
              [fx, h - 0.02, 0],
              [fx, h + 0.1, 0],
              [fx - 0.06, h + 0.13, 0],
              [fx - 0.13, h + 0.09, 0],
            ],
            0.014,
            cm,
          ),
        );
        [-1, 1].forEach((s) => g.add(cyl(0.02, 0.02, 0.04, cm, fx, h, s * 0.1, 16)));
        g.add(
          rot(rbox(0.08, 0.16, 0.3, cer, -w / 2 + t + 0.06, h - 0.12, 0, 0.04), 0, 0, -0.5),
          rbox(0.22, 0.05, 0.16, fabric('#e9e2d6'), fx - 0.05, h, d / 2 - 0.1, 0.02),
        );
        break;
      }
      case 'washer':
      case 'dryer': {
        const bm = mat(c, { roughness: 0.35 }),
          R0 = Math.min(w, d) * 0.25,
          fz = d / 2 - 0.02;
        g.add(
          box(w - 0.02, 0.04, d - 0.04, '#8f969b', 0, 0, -0.02),
          rbox(w, 0.81, d - 0.02, bm, 0, 0.04, -0.01, 0.025),
        );
        g.add(
          box(w - 0.04, 0.1, 0.006, lighter(c, 0.3), 0, 0.72, fz + 0.003),
          rbox(0.18, 0.07, 0.01, bm, -w / 2 + 0.12, 0.735, fz + 0.006, 0.004),
        );
        g.add(box(0.12, 0.035, 0.003, screenMat('#1f6f6a'), w * 0.14, 0.745, fz + 0.007));
        const kn = cyl(0.03, 0.03, 0.02, chrome(), -w * 0.02, 0.75, fz + 0.016, 28);
        kn.rotation.x = Math.PI / 2;
        g.add(kn);
        const dr = new THREE.Mesh(
          new THREE.CircleGeometry(R0, 40),
          mat('#1b1f22', { roughness: 0.6 }),
        );
        dr.position.set(0, 0.4, fz + 0.004);
        g.add(dr);
        const rg = new THREE.Mesh(
          new THREE.TorusGeometry(R0 + 0.02, 0.022, 14, 48),
          mat('#c7cfd5', { metalness: 0.7, roughness: 0.25 }),
        );
        rg.position.set(0, 0.4, fz + 0.016);
        sh(rg);
        g.add(rg);
        const Rs = R0 * 1.42,
          cap = new THREE.Mesh(
            new THREE.SphereGeometry(Rs, 32, 12, 0, Math.PI * 2, 0, 0.78),
            mat(f.type === 'dryer' ? '#4a4038' : '#26343d', {
              roughness: 0.04,
              metalness: 0.2,
              transparent: true,
              opacity: 0.8,
            }),
          );
        cap.rotation.x = Math.PI / 2;
        cap.position.set(0, 0.4, fz + 0.012 - Rs * Math.cos(0.78));
        g.add(cap);
        g.add(box(w - 0.06, 0.004, 0.003, '#b9c3ca', 0, 0.08, fz + 0.002));
        break;
      }
      case 'crib': {
        const wm = woodM(c);
        g.add(
          rbox(w - 0.09, 0.12, d - 0.09, fabric('#ffffff'), 0, 0.3, 0, 0.04),
          box(w - 0.06, 0.025, d - 0.06, wm, 0, 0.28),
        );
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].forEach(([a, b]) =>
          g.add(
            rbox(0.045, 0.95, 0.045, wm, a * (w / 2 - 0.022), 0, b * (d / 2 - 0.022), 0.008),
            blob(0.028, 0.028, 0.028, wm, a * (w / 2 - 0.022), 0.97, b * (d / 2 - 0.022), 14),
          ),
        );
        [-1, 1].forEach((s) => {
          const z = s * (d / 2 - 0.022),
            x = s * (w / 2 - 0.022);
          g.add(
            rbox(w - 0.05, 0.035, 0.03, wm, 0, 0.88, z, 0.008),
            rbox(w - 0.05, 0.035, 0.03, wm, 0, 0.25, z, 0.008),
            rbox(0.03, 0.035, d - 0.05, wm, x, 0.88, 0, 0.008),
            rbox(0.03, 0.035, d - 0.05, wm, x, 0.25, 0, 0.008),
          );
          for (let p = -w / 2 + 0.09; p < w / 2 - 0.05; p += 0.075)
            g.add(rod([p, 0.28, z], [p, 0.88, z], 0.009, wm, 0.009, 8));
          for (let p = -d / 2 + 0.09; p < d / 2 - 0.05; p += 0.075)
            g.add(rod([x, 0.28, p], [x, 0.88, p], 0.009, wm, 0.009, 8));
        });
        g.add(
          rbox(w * 0.5, 0.03, d - 0.14, fabric('#f3d9c9'), w * 0.12, 0.42, 0, 0.015),
          rbox(0.3, 0.06, 0.2, fabric('#fbfaf7'), -w / 2 + 0.22, 0.42, 0, 0.03),
        );
        const bx = -w * 0.3 + 0.1,
          bear = '#c9a27a';
        g.add(
          blob(0.05, 0.06, 0.045, bear, bx, 0.5, 0.12),
          blob(0.045, 0.042, 0.04, bear, bx, 0.59, 0.12),
          blob(0.016, 0.016, 0.01, bear, bx - 0.032, 0.625, 0.12),
          blob(0.016, 0.016, 0.01, bear, bx + 0.032, 0.625, 0.12),
        );
        break;
      }
      case 'beanbag': {
        const fab = mat(c, { roughness: 0.95 });
        g.add(
          blob(w * 0.5, 0.3, d * 0.5, fab, 0, 0.3, 0, 40),
          blob(w * 0.42, 0.22, d * 0.22, fab, 0, 0.5, bz + d * 0.26, 32),
        );
        break;
      }
      case 'sidetable': {
        const r = Math.min(w, d) / 2,
          bm = blackMetal();
        g.add(
          lathe(
            [
              [r * 0.55, 0],
              [r * 0.55, 0.012],
              [0.03, 0.035],
              [0.018, 0.3],
              [0.025, 0.5],
              [0.08, 0.52],
            ],
            bm,
            0,
            0,
            0,
            40,
          ),
          cyl(r, r * 0.98, 0.025, mat(c, { roughness: 0.35 }), 0, 0.52, 0, 48),
        );
        g.add(box(0.16, 0.02, 0.12, '#4f6b8a', -r * 0.25, 0.545, 0));
        vase(g, r * 0.35, 0.545, -r * 0.1, 0.035, 0.12, '#e9e2d6', R, false);
        break;
      }
      case 'floorlamp': {
        const r = Math.min(w, d) / 2,
          lm = mat(c, { roughness: 0.35, metalness: 0.5 });
        g.add(
          lathe(
            [
              [0, 0],
              [r * 0.55, 0],
              [r * 0.58, 0.012],
              [r * 0.5, 0.03],
              [0.02, 0.035],
            ],
            lm,
            0,
            0,
            0,
            40,
          ),
          rod([0, 0.03, 0], [0, 1.36, 0], 0.011, lm),
        );
        g.add(
          lathe(
            [
              [r * 0.85, 0],
              [r * 0.55, 0.36],
            ],
            glowMat('#f6ecd9', '#ffdca0', 0.45),
            0,
            1.22,
            0,
            48,
          ),
          blob(0.035, 0.035, 0.035, glowMat('#fff', '#ffe2b0', 1.2), 0, 1.36, 0, 12),
        );
        g.add(ring(r * 0.85, 0.004, lm, 0, 1.22, 0), ring(r * 0.55, 0.004, lm, 0, 1.58, 0));
        break;
      }
      case 'island': {
        const cm = mat(c, { roughness: 0.45 }),
          stone = mat('#dcd7cf', { roughness: 0.2 }),
          cd = d - 0.3,
          n = Math.max(1, Math.round((w - 0.1) / 0.6)),
          cab = new THREE.Group(),
          fz = cd / 2 - 0.03;
        cab.add(
          box(w - 0.12, 0.1, cd - 0.08, '#4a4641', 0, 0, -0.04),
          box(w - 0.1, 0.74, cd - 0.03, cm, 0, 0.1, -0.015),
        );
        fronts(cab, -w / 2 + 0.05, 0.64, w - 0.1, 0.2, fz, n, 1, cm, 'bar');
        fronts(cab, -w / 2 + 0.05, 0.1, w - 0.1, 0.54, fz, n, 1, cm, 'bar', 0.56);
        cab.rotation.y = Math.PI;
        cab.position.z = bz + cd / 2;
        g.add(cab); // 柜门朝 -z，+z 侧留出吧台挑空
        g.add(rbox(w, 0.05, d, stone, 0, 0.84, 0, 0.006));
        [-1, 1].forEach((s) => g.add(box(0.04, 0.84, d, stone, s * (w / 2 - 0.02), 0, 0))); // 瀑布式侧板
        g.add(
          lathe(
            [
              [0, 0],
              [0.06, 0],
              [0.14, 0.06],
              [0.15, 0.07],
            ],
            mat('#6b543f', { roughness: 0.5, side: THREE.DoubleSide }),
            w * 0.22,
            0.89,
            0,
            32,
          ),
        );
        for (let k = 0; k < 4; k++)
          g.add(
            blob(
              0.04,
              0.04,
              0.04,
              ['#d98c4a', '#9fbf5a', '#b5463a', '#e6c14f'][k],
              w * 0.22 + Math.cos(k * 1.6) * 0.05,
              0.935 + (k === 3 ? 0.04 : 0),
              Math.sin(k * 1.6) * 0.05,
              14,
            ),
          );
        vase(g, -w * 0.25, 0.89, -0.05, 0.05, 0.22, '#e9e2d6', R);
        break;
      }
      case 'barstool': {
        const r = Math.min(w, d) / 2,
          bm = blackMetal(),
          sy = 0.7;
        [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ].forEach(([a, b]) =>
          g.add(rod([a * r * 0.72, 0, b * r * 0.72], [a * r * 0.4, sy, b * r * 0.4], 0.011, bm)),
        );
        g.add(
          ring(Math.SQRT2 * r * (0.72 - 0.32 * 0.4), 0.008, bm, 0, 0.28, 0),
          cyl(r * 0.55, r * 0.55, 0.02, bm, 0, sy - 0.01, 0, 32),
        );
        g.add(
          lathe(
            [
              [0, 0],
              [r * 0.85, 0],
              [r * 0.95, 0.02],
              [r * 0.97, 0.045],
              [r * 0.9, 0.07],
              [0, 0.075],
            ],
            mat(c, { roughness: 0.6 }),
            0,
            sy,
            0,
            40,
          ),
        );
        break;
      }
      case 'waterheater': {
        const r = Math.min(d / 2, 0.23),
          L = w - 0.06,
          yc = 1.95,
          zc = bz + r + 0.02,
          tm = mat(c, { roughness: 0.35 }),
          cp = mat('#cfd4d8', { roughness: 0.4 });
        const tank = mesh(new THREE.CylinderGeometry(r, r, L, 40), tm);
        tank.rotation.z = Math.PI / 2;
        tank.position.set(0, yc, zc);
        g.add(tank);
        [-1, 1].forEach((s) =>
          g.add(
            blob(0.035, r * 0.99, r * 0.99, cp, (s * L) / 2, yc, zc, 32),
            box(0.05, r * 1.1, 0.02, '#9a9ea3', s * L * 0.3, yc - r * 0.55, bz + 0.01),
          ),
        );
        g.add(
          rbox(0.2, 0.09, 0.02, '#e7eaec', L * 0.18, yc - 0.05, zc + r * 0.93, 0.008),
          box(
            0.07,
            0.03,
            0.002,
            screenMat('#2f8f7a'),
            L * 0.18 - 0.04,
            yc - 0.02,
            zc + r * 0.93 + 0.011,
          ),
        );
        (
          [
            [-L * 0.3, '#3b7bbf'],
            [-L * 0.18, '#c0463a'],
          ] as [number, string][]
        ).forEach(([x, cc]) =>
          g.add(
            rod([x, yc - r * 0.8, zc], [x, 1.3, zc], 0.012, metal()),
            cyl(0.02, 0.02, 0.03, cc, x, 1.5, zc, 12),
          ),
        );
        break;
      }
      case 'tv': {
        const th = w * 0.5625,
          yb = 1.2 - th / 2,
          z = bz + 0.03;
        g.add(rbox(w * 0.6, th * 0.6, 0.03, '#222', 0, yb + th * 0.2, bz + 0.015, 0.01));
        g.add(
          rbox(
            w,
            th,
            0.025,
            mat('#18181a', { roughness: 0.4, metalness: 0.3 }),
            0,
            yb,
            z + 0.01,
            0.004,
          ),
          box(w - 0.016, th - 0.022, 0.002, screenMat('#1f2b3a'), 0, yb + 0.014, z + 0.0235),
          box(0.04, 0.006, 0.002, '#8a8a8e', 0, yb + 0.004, z + 0.0235),
        );
        break;
      }
      case 'aircon': {
        const am = mat(c, { roughness: 0.3 }),
          h = 1.8,
          fz = d / 2 - 0.005;
        g.add(
          rbox(w, 0.06, d, '#cfd3d6', 0, 0, 0, 0.015),
          rbox(w - 0.01, h - 0.06, d - 0.01, am, 0, 0.06, 0, 0.06),
        );
        g.add(
          rbox(w - 0.06, 1.0, 0.01, mat(lighter(c, 0.4), { roughness: 0.12 }), 0, 0.22, fz, 0.005),
          box(w - 0.1, 0.42, 0.01, '#3d4145', 0, 1.28, fz),
        );
        for (let i = 0; i < 8; i++)
          g.add(rot(box(w - 0.11, 0.012, 0.03, '#e4e7ea', 0, 1.3 + i * 0.05, fz + 0.008), -0.35));
        g.add(
          box(
            0.1,
            0.035,
            0.003,
            mat('#101214', { emissive: '#4fb3a5', emissiveIntensity: 0.7 }),
            0,
            1.12,
            fz + 0.006,
          ),
        );
        for (let i = 0; i < 8; i++)
          g.add(box(w - 0.12, 0.005, 0.004, '#b9bfc4', 0, 0.09 + i * 0.015, fz + 0.002));
        break;
      }
      case 'acwall': {
        const h = 0.3,
          am = mat(c, { roughness: 0.3 }),
          s = new THREE.Shape();
        s.moveTo(0, 0.02);
        s.lineTo(0, h);
        s.lineTo(d * 0.75, h);
        s.quadraticCurveTo(d, h, d, h * 0.55);
        s.quadraticCurveTo(d, 0, d * 0.55, 0);
        s.lineTo(0.02, 0);
        s.lineTo(0, 0.02);
        const geo = new THREE.ExtrudeGeometry(s, {
          depth: w - 0.02,
          bevelEnabled: true,
          bevelThickness: 0.01,
          bevelSize: 0.006,
          bevelSegments: 3,
          curveSegments: 16,
        });
        geo.rotateY(-Math.PI / 2);
        geo.translate((w - 0.02) / 2, 2.2, bz);
        g.add(mesh(geo, am));
        g.add(
          box(w - 0.12, 0.004, 0.07, '#3a3d40', 0, 2.19, bz + d * 0.55),
          rot(box(w - 0.12, 0.008, 0.06, am, 0, 2.18, bz + d * 0.72), 0.35),
        );
        g.add(
          box(
            0.06,
            0.018,
            0.002,
            mat('#101214', { emissive: '#4fb3a5', emissiveIntensity: 0.7 }),
            w * 0.3,
            2.2 + h * 0.5,
            bz + d + 0.007,
          ),
        );
        for (let i = 0; i < 6; i++)
          g.add(box(w - 0.12, 0.003, 0.008, '#d5d9dc', 0, 2.2 + h + 0.006, bz + 0.03 + i * 0.022));
        break;
      }
      case 'dishwasher': {
        const dm = mat(c, { metalness: 0.55, roughness: 0.28 }),
          fz = d / 2 - 0.02;
        g.add(
          box(w - 0.01, 0.08, d - 0.07, '#3a3834', 0, 0, -0.035),
          box(w - 0.005, 0.76, d - 0.03, '#8b9095', 0, 0.08, -0.015),
        );
        g.add(
          rbox(w - 0.006, 0.7, 0.02, dm, 0, 0.085, fz, 0.004),
          box(w - 0.006, 0.055, 0.02, '#26282a', 0, 0.785, fz),
        );
        for (let i = 0; i < 4; i++)
          g.add(
            box(
              0.012,
              0.006,
              0.002,
              mat('#101214', { emissive: i ? '#6fd0ff' : '#7fe08a', emissiveIntensity: 0.8 }),
              w * 0.1 + i * 0.03,
              0.81,
              fz + 0.011,
            ),
          );
        pull(g, w * 0.6, false, 0, 0.74, fz + 0.01);
        break;
      }
      case 'ovencol': {
        const cm = mat(c, { roughness: 0.5 }),
          h = 2.1,
          fz = d / 2 - 0.02,
          frm = mat('#1c1d1f', { roughness: 0.3, metalness: 0.5 }),
          gl = mat('#0b0c0d', { roughness: 0.03, metalness: 0.6 });
        g.add(
          box(w - 0.02, 0.08, d - 0.06, '#4a4641', 0, 0, -0.03),
          box(w, h - 0.08, d - 0.02, cm, 0, 0.08, -0.01),
        );
        fronts(g, -w / 2, 0.08, w, 0.6, fz, 1, 2, cm, 'bar');
        fronts(g, -w / 2, 1.78, w, h - 1.8, fz, 1, 1, cm, 'bar', 1.84);
        [
          [0.7, 0.58],
          [1.3, 0.46],
        ].forEach(([y, ah]) => {
          g.add(
            box(w - 0.02, ah - 0.01, 0.02, frm, 0, y, fz + 0.01),
            box(w - 0.1, ah * 0.52, 0.003, gl, 0, y + ah * 0.1, fz + 0.021),
            box(w - 0.04, 0.06, 0.003, '#2a2c2e', 0, y + ah - 0.075, fz + 0.021),
          );
          g.add(
            box(
              0.08,
              0.022,
              0.002,
              mat('#101214', { emissive: '#ff9a3c', emissiveIntensity: 0.7 }),
              0,
              y + ah - 0.056,
              fz + 0.023,
            ),
          );
          pull(g, w * 0.7, false, 0, y + ah * 0.72, fz + 0.02);
        });
        break;
      }
      case 'purifier': {
        const pm = mat(c, { roughness: 0.45 }),
          h = 0.72;
        g.add(
          rbox(w, h, d, pm, 0, 0, 0, Math.min(w, d) * 0.2),
          rbox(w - 0.05, 0.006, d - 0.05, '#8d959b', 0, h - 0.002, 0, 0.02),
        );
        for (let i = 0; i < 7; i++)
          g.add(
            box(
              w - 0.07,
              0.004,
              0.006,
              '#6f777d',
              0,
              h + 0.002,
              -d / 2 + 0.05 + (i * (d - 0.1)) / 6,
            ),
          );
        g.add(rbox(w - 0.06, 0.42, 0.006, fabric('#c8ccd0'), 0, 0.06, d / 2 - 0.001, 0.01));
        const rg = new THREE.Mesh(
          new THREE.TorusGeometry(0.03, 0.004, 8, 32),
          mat('#101214', { emissive: '#4fb3a5', emissiveIntensity: 0.8 }),
        );
        rg.position.set(0, 0.6, d / 2 + 0.002);
        g.add(rg);
        break;
      }
      case 'officechair': {
        const r = Math.min(w, d) * 0.46,
          dk = darker(c, 0.75),
          bm = mat('#2b2b2d', { roughness: 0.45 }),
          cm = chrome();
        for (let k = 0; k < 5; k++) {
          const a = (k * Math.PI * 2) / 5,
            tx = Math.sin(a) * r * 0.95,
            tz = Math.cos(a) * r * 0.95;
          g.add(
            rod([0, 0.1, 0], [tx, 0.07, tz], 0.022, bm, 0.014, 10),
            cyl(0.008, 0.008, 0.03, bm, tx, 0.04, tz, 8),
            rot(cyl(0.026, 0.026, 0.03, '#111', tx, 0.026 - 0.015, tz, 16), 0, a, Math.PI / 2),
          );
        }
        g.add(
          cyl(0.05, 0.06, 0.05, bm, 0, 0.08, 0, 20),
          cyl(0.025, 0.025, 0.22, cm, 0, 0.12, 0, 16),
          cyl(0.036, 0.036, 0.12, bm, 0, 0.12, 0, 16),
          rbox(0.22, 0.05, 0.22, bm, 0, 0.34, 0.02, 0.01),
        );
        g.add(
          rbox(w * 0.78, 0.03, d * 0.72, bm, 0, 0.38, 0.04, 0.01),
          rbox(w * 0.8, 0.08, d * 0.74, fabric(c), 0, 0.4, 0.05, 0.035),
        );
        g.add(
          tube(
            [
              [0, 0.36, 0],
              [0, 0.38, bz + 0.12],
              [0, 0.6, bz + 0.07],
            ],
            0.02,
            bm,
          ),
        );
        const bf = shell(w * 0.72, 0.6, 0.03, 0.025, 0.08, bm);
        bf.rotation.x = Math.PI / 2 - 0.12;
        bf.position.set(0, 0.88, bz + 0.06);
        g.add(bf);
        g.add(
          rot(
            box(
              w * 0.68,
              0.56,
              0.006,
              mat(dk, {
                roughness: 0.85,
                transparent: true,
                opacity: 0.88,
                side: THREE.DoubleSide,
              }),
              0,
              0.6,
              bz + 0.085,
            ),
            -0.12,
          ),
          rot(rbox(w * 0.5, 0.08, 0.03, fabric(c), 0, 0.66, bz + 0.11, 0.015), -0.12),
        );
        g.add(
          rod([-0.05, 1.14, bz + 0.025], [-0.05, 1.22, bz + 0.015], 0.008, bm),
          rod([0.05, 1.14, bz + 0.025], [0.05, 1.22, bz + 0.015], 0.008, bm),
          rbox(w * 0.45, 0.12, 0.05, fabric(dk), 0, 1.2, bz + 0.02, 0.025),
        );
        [-1, 1].forEach((s) =>
          g.add(
            box(0.035, 0.22, 0.035, bm, s * w * 0.4, 0.42, 0.04),
            rbox(0.07, 0.03, d * 0.4, bm, s * w * 0.4, 0.63, 0.04, 0.012),
          ),
        );
        break;
      }
      case 'piano': {
        const pk = mat(c, { roughness: 0.12, metalness: 0.1 }),
          bd = d * 0.5,
          kz = bz + bd,
          h = 1.25,
          kd = d * 0.22 - 0.03,
          iv = mat('#faf8f3', { roughness: 0.3 }),
          eb = mat('#111', { roughness: 0.25 }),
          kw = (w - 0.12) / 52;
        g.add(
          box(w, h, bd, pk, 0, 0, bz + bd / 2),
          rbox(w + 0.02, 0.03, bd + 0.03, pk, 0, h, bz + bd / 2 + 0.01, 0.008),
        );
        [-1, 1].forEach((s) =>
          g.add(
            rbox(0.06, 0.13, kd + 0.06, pk, s * (w / 2 - 0.03), 0.6, kz + (kd + 0.06) / 2, 0.01),
            box(0.05, 0.6, 0.05, pk, s * (w / 2 - 0.08), 0, kz + kd + 0.01),
            box(0.06, 0.04, d - bd, pk, s * (w / 2 - 0.08), 0, kz + (d - bd) / 2),
          ),
        );
        g.add(
          box(w - 0.12, 0.08, kd + 0.05, pk, 0, 0.6, kz + (kd + 0.05) / 2),
          box(w - 0.12, 0.1, 0.03, pk, 0, 0.68, kz + 0.015),
        );
        for (let i = 0; i < 52; i++) {
          const x = -w / 2 + 0.06 + kw * (i + 0.5);
          g.add(box(kw - 0.0015, 0.022, kd, iv, x, 0.68, kz + 0.03 + kd / 2));
          if (i < 51 && 'ACDFG'.includes('ABCDEFG'[i % 7]))
            g.add(box(kw * 0.58, 0.02, kd * 0.62, eb, x + kw / 2, 0.7, kz + 0.03 + kd * 0.31));
        }
        g.add(rot(box(w * 0.42, 0.18, 0.012, pk, 0, 0.84, kz + 0.012), -0.25));
        [-0.06, 0, 0.06].forEach((x) =>
          g.add(
            box(
              0.025,
              0.012,
              0.07,
              mat('#c9a35a', { metalness: 0.9, roughness: 0.3 }),
              x,
              0.05,
              kz + 0.03,
            ),
          ),
        );
        const mt = cyl(0.0, 0.05, 0.2, woodM('#5a3e2b'), w * 0.3, h + 0.03, bz + bd / 2, 4);
        mt.rotation.y = Math.PI / 4;
        g.add(mt);
        g.add(
          rot(box(0.14, 0.18, 0.015, woodM('#c9a27a'), -w * 0.3, h + 0.03, bz + 0.06), -0.15),
          rot(box(0.11, 0.14, 0.002, '#9fb3c2', -w * 0.3, h + 0.05, bz + 0.07), -0.15),
        );
        break;
      }
      case 'treadmill': {
        const tm = mat(c, { roughness: 0.55 }),
          bm = mat('#2a2a2c', { roughness: 0.5 }),
          al = mat('#9a9ea3', { metalness: 0.6, roughness: 0.4 });
        g.add(
          rbox(w, 0.14, d - 0.25, tm, 0, 0.03, 0.125, 0.03),
          box(w - 0.16, 0.006, d - 0.5, '#141414', 0, 0.17, 0.15),
        );
        [-1, 1].forEach((s) =>
          g.add(box(0.07, 0.008, d - 0.45, al, s * (w / 2 - 0.05), 0.17, 0.15)),
        );
        [bz + 0.06, d / 2 - 0.06].forEach((z) =>
          [-1, 1].forEach((s) => g.add(box(0.06, 0.03, 0.06, bm, s * (w / 2 - 0.06), 0, z))),
        );
        g.add(rbox(w, 0.22, 0.32, tm, 0, 0, bz + 0.16, 0.05));
        [-1, 1].forEach((s) =>
          g.add(
            rod(
              [s * (w / 2 - 0.06), 0.15, bz + 0.2],
              [s * (w / 2 - 0.06), 1.15, bz + 0.3],
              0.025,
              bm,
              0.022,
            ),
            tube(
              [
                [s * (w / 2 - 0.06), 1.0, bz + 0.28],
                [s * (w / 2 - 0.06), 1.0, bz + 0.5],
                [s * (w / 2 - 0.07), 0.97, bz + 0.62],
              ],
              0.018,
              bm,
            ),
          ),
        );
        const cg = new THREE.Group();
        cg.position.set(0, 1.2, bz + 0.31);
        cg.rotation.x = -0.5;
        cg.add(
          rbox(w * 0.8, 0.2, 0.08, bm, 0, -0.1, 0, 0.02),
          box(w * 0.4, 0.11, 0.004, screenMat('#2a5d8f'), 0, -0.055, 0.041),
        );
        g.add(cg);
        break;
      }
      default:
        g.add(box(w, 0.8, d, c));
    }
    g.position.set(wx(f.cx), 0, wz(f.cy));
    g.rotation.y = (-f.rot * Math.PI) / 180; // 平面顺时针旋转 → 绕 Y 轴负向
    g.userData.fid = f.id;
    return g;
  }

  return {
    buildFurniture,
    floorMat,
    mat,
    box,
    glassMat,
    setEnvironmentIntensity(value: number) {
      envK = value;
      matCache.forEach((m) => {
        if (m.envMap) m.envMapIntensity = Number(m.userData.env) * envK;
      });
    },
    sweep(root: THREE.Object3D) {
      const live = new Set<THREE.Material>();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => live.add(m));
        }
      });
      for (const [key, m] of matCache)
        if (!live.has(m)) {
          m.dispose();
          matCache.delete(key);
        }
    },
    dispose() {
      matCache.forEach((m) => m.dispose());
      matCache.clear();
      Object.values(floorMats).forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      glassMat.dispose();
    },
  };
}
