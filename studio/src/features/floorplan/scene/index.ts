import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ROOMS } from '../catalog';
import type { FloorplanScene, SceneBridge, SceneOptions } from '../types';
import { createModelFactory, H, OX, OY, wx, wz } from './models';
import { createArchitecture, clearGroup, type SceneDoor } from './architecture';
import './scene.css';

type Pose = { target: THREE.Vector3; position: THREE.Vector3 };
type Hit =
  { kind: 'door'; door: SceneDoor; distance: number } | { kind: 'furn' | 'room'; id: string };
type Drag = {
  id: string;
  pointer: number;
  x: number;
  y: number;
  ox: number;
  oy: number;
  moved: boolean;
};
const area = (poly: [number, number][]) =>
  Math.abs(
    poly.reduce((sum, [x, y], i) => {
      const next = poly[(i + 1) % poly.length];
      return sum + x * next[1] - next[0] * y;
    }, 0),
  ) / 2e6;
const visible = (object: THREE.Object3D): boolean =>
  object.visible && (!object.parent || visible(object.parent));
const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]');

export function createFloorplanScene(host: HTMLElement, bridge: SceneBridge): FloorplanScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const width = () => Math.max(1, host.clientWidth),
    height = () => Math.max(1, host.clientHeight);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const opt: SceneOptions = {
    cut: H,
    furn: true,
    labels: true,
    night: false,
    hour: 10,
    mode: 'orbit',
  };
  const signalController = new AbortController(),
    { signal } = signalController;
  let disposed = false,
    raf = 0,
    lastTime = performance.now(),
    dirty = true;
  let fly: { a: Pose; b: Pose; start: number; duration: number } | null = null;
  let drag: Drag | null = null;
  let look: { pointer: number; x: number; y: number } | null = null;
  let down: { x: number; y: number; pointer: number } | null = null;
  let touchWalk = false,
    contextLost = false;
  let archKey = '',
    floorKey = '',
    labelKey = '';
  let selectionKey = '',
    selection: THREE.BoxHelper | null = null;
  let orbitPose: Pose | null = null;
  const keys = new Set<string>();
  const joystick = { x: 0, y: 0, pointer: -1 };
  const models = new Map<string, { group: THREE.Group; signature: string }>();
  const labels = new Map<string, CSS2DObject>();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width() / height(), 0.05, 300);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.maxPolarAngle = Math.PI * 0.495;
  orbit.minDistance = 1.5;
  orbit.maxDistance = 45;
  const walk = new PointerLockControls(camera, renderer.domElement);
  const labelRenderer = new CSS2DRenderer();
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setSize(width(), height());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  labelRenderer.setSize(width(), height());
  renderer.domElement.className = 'floorplan-scene-canvas';
  labelRenderer.domElement.className = 'floorplan-scene-labels';
  const environment = new RoomEnvironment(),
    pmrem = new THREE.PMREMGenerator(renderer);
  let env: THREE.WebGLRenderTarget;
  try {
    env = pmrem.fromScene(environment, 0.04);
  } catch (error) {
    orbit.dispose();
    walk.dispose();
    renderer.dispose();
    throw error;
  } finally {
    pmrem.dispose();
    environment.dispose();
  }
  const factory = createModelFactory(renderer, env.texture);
  const arch = createArchitecture(factory, bridge.getState, opt);
  const furniture = new THREE.Group();
  const hemi = new THREE.HemisphereLight(0xfff8ee, 0xb9a88f, 1.1);
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, {
    left: -11,
    right: 11,
    top: 11,
    bottom: -11,
    near: 1,
    far: 60,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0xf2eee7, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.015;
  ground.receiveShadow = true;
  scene.add(hemi, sun, sun.target, ground, arch.archFloor, arch.archUp, arch.lampG, furniture);
  const ray = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const overlay = document.createElement('button');
  overlay.type = 'button';
  overlay.className = 'floorplan-walk-start';
  overlay.textContent = coarse
    ? '点击开始漫游 · 左下摇杆移动 · 拖动画面转向 · 点门开关'
    : '点击开始漫游 · WASD 移动 · Shift 快走 · E 开关门 · Esc 暂停';
  const joy = document.createElement('div');
  joy.className = 'floorplan-walk-joystick';
  joy.setAttribute('aria-label', '漫游方向摇杆');
  joy.setAttribute('role', 'group');
  const knob = document.createElement('i');
  joy.append(knob);
  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'floorplan-walk-exit';
  exit.textContent = '退出漫游';
  const cross = document.createElement('span');
  cross.className = 'floorplan-walk-cross';
  cross.textContent = '+';
  cross.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement, labelRenderer.domElement, overlay, joy, exit, cross);
  syncWalkUi();

  function invalidate() {
    dirty = true;
    if (!disposed && !contextLost && !document.hidden && !raf) raf = requestAnimationFrame(frame);
  }
  function setPose(pose: Pose) {
    camera.position.copy(pose.position);
    orbit.target.copy(pose.target);
    camera.lookAt(pose.target);
    camera.updateMatrixWorld();
  }
  const currentPose = (): Pose => ({
    position: camera.position.clone(),
    target: orbit.target.clone(),
  });
  const wholePose = (): Pose => ({
    target: new THREE.Vector3(),
    position: new THREE.Vector3(5.5, 15.5, 10),
  });
  function flyTo(b: Pose) {
    if (disposed) return;
    if (reducedMotion.matches) {
      fly = null;
      setPose(b);
    } else fly = { a: currentPose(), b, start: performance.now(), duration: 850 };
    invalidate();
  }
  function render() {
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  function syncWalkUi() {
    overlay.hidden = opt.mode !== 'walk' || touchWalk || walk.isLocked;
    joy.hidden = opt.mode !== 'walk' || !touchWalk;
    exit.hidden = opt.mode !== 'walk';
    cross.hidden = opt.mode !== 'walk' || !(touchWalk || walk.isLocked);
  }
  function startTouchWalk() {
    if (opt.mode !== 'walk' || disposed) return;
    touchWalk = true;
    syncWalkUi();
    invalidate();
  }
  function stopMotion() {
    keys.clear();
    joystick.x = joystick.y = 0;
    joystick.pointer = -1;
    knob.style.transform = '';
    look = null;
  }
  function setMode(mode: SceneOptions['mode']) {
    if (mode === opt.mode) return;
    cancelDrag();
    stopMotion();
    fly = null;
    if (mode === 'walk') {
      orbitPose = currentPose();
      opt.mode = mode;
      bridge.select(null);
      orbit.enabled = false;
      camera.position.set(wx(4200), 1.6, wz(8755));
      camera.lookAt(wx(7000), 1.5, wz(8755));
      if (coarse) startTouchWalk();
    } else {
      opt.mode = mode;
      walk.unlock();
      touchWalk = false;
      orbit.enabled = true;
      if (orbitPose) setPose(orbitPose);
      else setPose(wholePose());
    }
    syncWalkUi();
    bridge.onMode(mode);
    update();
  }
  function rayFrom(x?: number, y?: number) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    if (x === undefined || y === undefined) pointer.set(0, 0);
    else {
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
      pointer.set(((x - rect.left) / rect.width) * 2 - 1, (-(y - rect.top) / rect.height) * 2 + 1);
    }
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    ray.setFromCamera(pointer, camera);
    return true;
  }
  function pick(x?: number, y?: number): Hit | null {
    if (!rayFrom(x, y)) return null;
    const hits = ray.intersectObjects([furniture, arch.archUp, arch.archFloor], true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      if (
        !visible(o) ||
        (o instanceof THREE.Mesh && o.material === factory.glassMat) ||
        o instanceof THREE.LineSegments
      )
        continue;
      if (o.userData.door)
        return { kind: 'door', door: o.userData.door as SceneDoor, distance: hit.distance };
      if (typeof o.userData.room === 'string') return { kind: 'room', id: o.userData.room };
      while (o && typeof o.userData.fid !== 'string') o = o.parent;
      if (o) return { kind: 'furn', id: o.userData.fid as string };
      return null;
    }
    return null;
  }
  function groundAt(x: number, y: number) {
    if (disposed || contextLost || opt.mode === 'walk' || !rayFrom(x, y)) return null;
    const point = new THREE.Vector3();
    if (!ray.ray.intersectPlane(groundPlane, point) || point.distanceTo(camera.position) > 60)
      return null;
    const wall = ray
      .intersectObjects([arch.archUp, arch.archFloor], true)
      .find(
        (hit) =>
          visible(hit.object) &&
          hit.object instanceof THREE.Mesh &&
          hit.object.material !== factory.glassMat,
      );
    if (wall && wall.distance < point.distanceTo(camera.position) - 0.02) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const pixels = (v: THREE.Vector3) => {
      v.project(camera);
      return new THREE.Vector2((v.x * rect.width) / 2, (v.y * rect.height) / 2);
    };
    const at = pixels(point.clone());
    const scale =
      Math.max(
        at.distanceTo(pixels(point.clone().add(new THREE.Vector3(1, 0, 0)))),
        at.distanceTo(pixels(point.clone().add(new THREE.Vector3(0, 0, 1)))),
      ) / 1000;
    return { x: point.x * 1000 + OX, y: point.z * 1000 + OY, s: scale };
  }
  function disposeSelection() {
    if (!selection) return;
    scene.remove(selection);
    selection.geometry.dispose();
    selection.material.dispose();
    selection = null;
  }
  function updateSelection() {
    const selected = bridge.getSelection();
    const id = opt.furn && opt.mode === 'orbit' && selected?.kind === 'furn' ? selected.id : '';
    const group = id ? models.get(id)?.group : undefined;
    if (id !== selectionKey || !!group !== !!selection) {
      disposeSelection();
      selectionKey = id;
      if (group) {
        selection = new THREE.BoxHelper(group, 0xa6532b);
        scene.add(selection);
      }
    }
    selection?.update();
  }
  function updateLabels() {
    const state = bridge.getState();
    const key = JSON.stringify(ROOMS.map((r) => [r.id, state.rooms[r.id]?.name]));
    if (key !== labelKey) {
      labelKey = key;
      for (const r of ROOMS) {
        if (!r.at) continue;
        let label = labels.get(r.id);
        if (!label) {
          const el = document.createElement('div');
          el.className = 'floorplan-room-label';
          const title = document.createElement('span'),
            detail = document.createElement('small');
          el.append(title, detail);
          label = new CSS2DObject(el);
          labels.set(r.id, label);
          scene.add(label);
        }
        label.element.firstElementChild!.textContent = state.rooms[r.id]?.name ?? r.name;
        label.element.lastElementChild!.textContent = `${area(r.poly).toFixed(1)} m²`;
      }
    }
    for (const r of ROOMS) {
      const label = labels.get(r.id);
      if (label && r.at) {
        label.position.set(wx(r.at[0]), opt.cut + 0.15, wz(r.at[1]));
        label.visible = opt.labels && opt.mode === 'orbit';
      }
    }
  }
  function light() {
    const t = (opt.hour - 6) / 12,
      az = Math.PI * (0.15 + t * 0.7),
      elevation = Math.sin(Math.PI * t) * 1.05 + 0.15,
      warm = 1 - Math.sin(Math.PI * t);
    sun.position.set(Math.cos(az) * 18, Math.sin(elevation) * 20 + 3, -Math.sin(az) * 10 + 8);
    sun.color.setHSL(0.09, 0.5 + warm * 0.4, 0.92 - warm * 0.12);
    sun.intensity = opt.night ? 0.05 : 1.4 + Math.sin(Math.PI * t) * 1.6;
    hemi.intensity = opt.night ? 0.12 : 1.1;
    scene.background = new THREE.Color(opt.night ? 0x1c2130 : 0xf7f4ee);
    ground.material.color.set(opt.night ? 0x2a2e38 : 0xf2eee7);
    arch.lampG.children.forEach((o) => {
      if (o instanceof THREE.PointLight) o.intensity = opt.night ? 6 : 0;
      else if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial)
        o.material.emissiveIntensity = opt.night ? 2 : 0.3;
    });
    renderer.toneMappingExposure = opt.night ? 1.25 : 1.05;
    factory.setEnvironmentIntensity(opt.night ? 0.15 : 1);
  }
  function update() {
    if (disposed) return;
    const state = bridge.getState(),
      nextArch = JSON.stringify([state.demolished, opt.mode === 'walk' ? H : opt.cut]);
    if (nextArch !== archKey) {
      archKey = nextArch;
      arch.rebuild();
      light();
    }
    const nextFloor = JSON.stringify(ROOMS.map((r) => state.rooms[r.id]?.mat));
    if (nextFloor !== floorKey) {
      floorKey = nextFloor;
      arch.updateFloors();
    }
    const live = new Set(state.furniture.map((f) => f.id));
    for (const [id, entry] of models)
      if (!live.has(id)) {
        furniture.remove(entry.group);
        clearGroup(entry.group);
        models.delete(id);
        if (selectionKey === id) {
          disposeSelection();
          selectionKey = '';
        }
      }
    for (const f of state.furniture) {
      const signature = JSON.stringify([f.type, f.w, f.d, f.color]);
      let entry = models.get(f.id);
      if (!entry || entry.signature !== signature) {
        if (entry) {
          furniture.remove(entry.group);
          clearGroup(entry.group);
        }
        if (selectionKey === f.id) {
          disposeSelection();
          selectionKey = '';
        }
        entry = { group: factory.buildFurniture(f), signature };
        models.set(f.id, entry);
        furniture.add(entry.group);
      }
      entry.group.position.set(wx(f.cx), 0, wz(f.cy));
      entry.group.rotation.y = (-f.rot * Math.PI) / 180;
    }
    furniture.visible = opt.furn;
    arch.updateMode();
    updateLabels();
    updateSelection();
    invalidate();
  }
  function cancelDrag() {
    if (!drag) return;
    drag = null;
    bridge.finishEdit(true);
    orbit.enabled = opt.mode === 'orbit';
    renderer.domElement.style.cursor = '';
    update();
  }
  function toggleDoor(hit: Hit | null, maxDistance = Infinity) {
    if (hit?.kind === 'door' && hit.distance < maxDistance) {
      hit.door.open = !hit.door.open;
      invalidate();
    }
  }

  host.addEventListener(
    'pointerdown',
    (event) => {
      if (
        event.target !== renderer.domElement ||
        event.button !== 0 ||
        opt.mode !== 'orbit' ||
        !event.isPrimary
      )
        return;
      const selected = bridge.getSelection();
      if (selected?.kind !== 'furn') return;
      const hit = pick(event.clientX, event.clientY),
        f = bridge.getState().furniture.find((f) => f.id === selected.id);
      const point =
        hit?.kind === 'furn' && hit.id === selected.id && f
          ? groundAt(event.clientX, event.clientY)
          : null;
      if (!point || !f) return;
      fly = null;
      orbit.enabled = false;
      bridge.beginEdit();
      drag = {
        id: f.id,
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        ox: point.x - f.cx,
        oy: point.y - f.cy,
        moved: false,
      };
      renderer.domElement.setPointerCapture(event.pointerId);
    },
    { capture: true, signal },
  );
  renderer.domElement.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0) return;
      down = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
      if (opt.mode === 'walk' && touchWalk && !look) {
        look = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
        renderer.domElement.setPointerCapture(event.pointerId);
      }
    },
    { signal },
  );
  renderer.domElement.addEventListener(
    'pointermove',
    (event) => {
      if (look?.pointer === event.pointerId) {
        const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        euler.y -= (event.clientX - look.x) * 0.005;
        euler.x = THREE.MathUtils.clamp(euler.x - (event.clientY - look.y) * 0.005, -1.35, 1.35);
        camera.quaternion.setFromEuler(euler);
        look.x = event.clientX;
        look.y = event.clientY;
        invalidate();
      }
      if (
        !drag ||
        drag.pointer !== event.pointerId ||
        (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5)
      )
        return;
      const f = bridge.getState().furniture.find((f) => f.id === drag?.id),
        point = groundAt(event.clientX, event.clientY);
      if (!f || !point) return;
      drag.moved = true;
      renderer.domElement.style.cursor = 'grabbing';
      const [cx, cy] = bridge.snapMove(f, point.x - drag.ox, point.y - drag.oy, point.s);
      bridge.previewFurniture(f.id, { cx, cy });
      const group = models.get(f.id)?.group;
      group?.position.set(wx(cx), 0, wz(cy));
      updateSelection();
      invalidate();
    },
    { signal },
  );
  renderer.domElement.addEventListener(
    'pointerup',
    (event) => {
      const wasDrag = drag?.pointer === event.pointerId && drag.moved;
      if (drag?.pointer === event.pointerId) {
        drag = null;
        bridge.finishEdit();
        orbit.enabled = opt.mode === 'orbit';
        renderer.domElement.style.cursor = '';
        update();
      }
      if (look?.pointer === event.pointerId) look = null;
      const tap =
        down?.pointer === event.pointerId &&
        Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 5;
      down = null;
      if (!tap || wasDrag) return;
      const hit = pick(event.clientX, event.clientY);
      if (opt.mode === 'walk') {
        toggleDoor(hit, 3.5);
        return;
      }
      if (hit?.kind === 'door') toggleDoor(hit);
      else {
        bridge.select(hit ? { kind: hit.kind, id: hit.id } : null);
        updateSelection();
        invalidate();
      }
    },
    { signal },
  );
  renderer.domElement.addEventListener(
    'pointercancel',
    (event) => {
      if (look?.pointer === event.pointerId) look = null;
      if (drag?.pointer === event.pointerId) cancelDrag();
      down = null;
    },
    { signal },
  );
  renderer.domElement.addEventListener(
    'lostpointercapture',
    (event) => {
      if (drag?.pointer === event.pointerId) cancelDrag();
      if (look?.pointer === event.pointerId) look = null;
    },
    { signal },
  );
  orbit.addEventListener('change', invalidate);
  const startOrbit = () => {
    fly = null;
    invalidate();
  };
  orbit.addEventListener('start', startOrbit);
  const syncLock = () => {
    syncWalkUi();
    stopMotion();
    invalidate();
  };
  walk.addEventListener('lock', syncLock);
  walk.addEventListener('unlock', syncLock);
  walk.addEventListener('change', invalidate);
  overlay.addEventListener(
    'click',
    () => {
      if (coarse) startTouchWalk();
      else {
        try {
          walk.lock();
        } catch {
          startTouchWalk();
        }
      }
    },
    { signal },
  );
  document.addEventListener('pointerlockerror', startTouchWalk, { signal });
  exit.addEventListener('click', () => setMode('orbit'), { signal });
  const moveJoy = (event: PointerEvent) => {
    const rect = joy.getBoundingClientRect(),
      limit = rect.width * 0.35;
    let x = event.clientX - rect.left - rect.width / 2,
      y = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(x, y);
    if (length > limit) {
      x *= limit / length;
      y *= limit / length;
    }
    joystick.x = x / limit;
    joystick.y = y / limit;
    knob.style.transform = `translate(${x}px,${y}px)`;
    invalidate();
  };
  joy.addEventListener(
    'pointerdown',
    (event) => {
      event.preventDefault();
      joystick.pointer = event.pointerId;
      joy.setPointerCapture(event.pointerId);
      moveJoy(event);
    },
    { signal },
  );
  joy.addEventListener(
    'pointermove',
    (event) => {
      if (joystick.pointer === event.pointerId) moveJoy(event);
    },
    { signal },
  );
  const endJoy = (event: PointerEvent) => {
    if (joystick.pointer !== event.pointerId) return;
    joystick.pointer = -1;
    joystick.x = joystick.y = 0;
    knob.style.transform = '';
  };
  joy.addEventListener('pointerup', endJoy, { signal });
  joy.addEventListener('pointercancel', endJoy, { signal });
  joy.addEventListener('lostpointercapture', endJoy, { signal });
  window.addEventListener(
    'keydown',
    (event) => {
      if (opt.mode !== 'walk' || editable(event.target)) return;
      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'ShiftLeft',
          'ShiftRight',
          'KeyE',
        ].includes(event.code)
      ) {
        event.preventDefault();
        event.stopPropagation();
        keys.add(event.code);
        invalidate();
      }
      if (event.code === 'KeyE' && !event.repeat) toggleDoor(pick(), 2.5);
      if (event.code === 'Escape' && touchWalk) {
        touchWalk = false;
        stopMotion();
        syncWalkUi();
      }
    },
    { capture: true, signal },
  );
  window.addEventListener('keyup', (event) => keys.delete(event.code), { signal });
  window.addEventListener(
    'blur',
    () => {
      stopMotion();
      cancelDrag();
    },
    { signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      lastTime = performance.now();
      if (document.hidden) {
        stopMotion();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else invalidate();
    },
    { signal },
  );
  renderer.domElement.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      contextLost = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      cancelDrag();
      bridge.notify('3D 显示暂时中断，可以返回 2D 继续编辑；恢复后将自动刷新。');
    },
    { signal },
  );
  renderer.domElement.addEventListener(
    'webglcontextrestored',
    () => {
      contextLost = false;
      invalidate();
    },
    { signal },
  );
  const resize = new ResizeObserver(() => {
    if (disposed) return;
    renderer.setSize(width(), height());
    labelRenderer.setSize(width(), height());
    camera.aspect = width() / height();
    camera.updateProjectionMatrix();
    invalidate();
  });
  resize.observe(host);

  function walkStep(dt: number) {
    if (!walk.isLocked && !touchWalk) return false;
    const forward = camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x),
      movement = new THREE.Vector3();
    if (keys.has('KeyW') || keys.has('ArrowUp')) movement.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) movement.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) movement.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) movement.sub(right);
    if (touchWalk)
      movement.addScaledVector(forward, -joystick.y).addScaledVector(right, joystick.x);
    const magnitude = Math.min(1, movement.length());
    if (magnitude < 0.05) return false;
    movement
      .normalize()
      .multiplyScalar(
        (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.6 : 1.4) * dt * magnitude,
      );
    if (!arch.blocked(camera.position.x + movement.x, camera.position.z))
      camera.position.x += movement.x;
    if (!arch.blocked(camera.position.x, camera.position.z + movement.z))
      camera.position.z += movement.z;
    return true;
  }
  function frame(now: number) {
    raf = 0;
    if (disposed || contextLost || document.hidden) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    let moving = false;
    if (fly) {
      const t = THREE.MathUtils.clamp((now - fly.start) / fly.duration, 0, 1),
        e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const target = fly.a.target.clone().lerp(fly.b.target, e);
      const a = new THREE.Spherical().setFromVector3(fly.a.position.clone().sub(fly.a.target)),
        b = new THREE.Spherical().setFromVector3(fly.b.position.clone().sub(fly.b.target));
      const theta = Math.atan2(Math.sin(b.theta - a.theta), Math.cos(b.theta - a.theta));
      const sphere = new THREE.Spherical(
        a.radius + (b.radius - a.radius) * e,
        a.phi + (b.phi - a.phi) * e,
        a.theta + theta * e,
      );
      camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sphere));
      orbit.target.copy(target);
      camera.lookAt(target);
      if (t >= 1) fly = null;
      moving = true;
    } else if (opt.mode === 'orbit') moving = orbit.update();
    else moving = walkStep(dt);
    for (const door of arch.doors) {
      const target = door.open ? door.a1 : door.a0;
      if (Math.abs(target - door.cur) > 0.001) {
        door.cur = reducedMotion.matches
          ? target
          : door.cur + (target - door.cur) * Math.min(1, dt * 8);
        door.pivot.rotation.y = door.cur;
        moving = true;
      } else if (door.cur !== target) {
        door.cur = target;
        door.pivot.rotation.y = target;
        moving = true;
      }
    }
    if (dirty || moving) {
      dirty = false;
      updateSelection();
      render();
    }
    if (moving || fly) invalidate();
  }
  const view = bridge.getViewport(),
    s = Math.max(view.s, 0.001);
  const center = new THREE.Vector3(
    wx(view.x0 + width() / 2 / s),
    0,
    wz(view.y0 + height() / 2 / s),
  );
  const distance = THREE.MathUtils.clamp(height() / s / 1000 / 2 / Math.tan(Math.PI / 8), 5, 40);
  setPose({ target: center, position: center.clone().add(new THREE.Vector3(0, distance, 0.001)) });
  update();
  flyTo(wholePose());

  return {
    update,
    setOptions(patch) {
      if (disposed) return;
      const mode = patch.mode;
      const previousNight = opt.night,
        previousHour = opt.hour;
      if (typeof patch.cut === 'number') opt.cut = patch.cut < 2 ? 1.2 : H;
      if (typeof patch.furn === 'boolean') opt.furn = patch.furn;
      if (typeof patch.labels === 'boolean') opt.labels = patch.labels;
      if (typeof patch.night === 'boolean') opt.night = patch.night;
      if (typeof patch.hour === 'number' && Number.isFinite(patch.hour))
        opt.hour = THREE.MathUtils.clamp(patch.hour, 7, 18);
      if (mode && mode !== opt.mode) setMode(mode);
      if (!opt.furn && bridge.getSelection()?.kind === 'furn') bridge.select(null);
      if (previousNight !== opt.night || previousHour !== opt.hour) light();
      update();
    },
    focusRoom(id) {
      if (opt.mode === 'walk') setMode('orbit');
      const room = ROOMS.find((r) => r.id === id);
      if (!room) {
        flyTo(wholePose());
        return;
      }
      const xs = room.poly.map((p) => p[0]),
        ys = room.poly.map((p) => p[1]);
      const target = new THREE.Vector3(
        wx((Math.min(...xs) + Math.max(...xs)) / 2),
        0.6,
        wz((Math.min(...ys) + Math.max(...ys)) / 2),
      );
      const size =
        Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 1000;
      const direction = camera.position.clone().sub(orbit.target).setY(0);
      if (direction.lengthSq() < 0.01) direction.set(0.6, 0, 0.8);
      direction.normalize();
      const distance = size * 1.3 + 2.2;
      flyTo({
        target,
        position: new THREE.Vector3(
          target.x + direction.x * distance * 0.7,
          distance * 1.05,
          target.z + direction.z * distance * 0.7,
        ),
      });
    },
    topView() {
      if (opt.mode === 'walk') setMode('orbit');
      flyTo({ target: new THREE.Vector3(), position: new THREE.Vector3(0, 19, 0.001) });
    },
    groundAt,
    async exportPng() {
      if (disposed || contextLost) throw new Error('3D 画面尚不可用，请重试或返回 2D 导出。');
      if (fly) {
        setPose(fly.b);
        fly = null;
      }
      await document.fonts.ready;
      if (disposed) throw new Error('3D 画面已关闭。');
      const oldVisible = selection?.visible;
      if (selection) selection.visible = false;
      render();
      const canvas = document.createElement('canvas');
      canvas.width = renderer.domElement.width;
      canvas.height = renderer.domElement.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法生成 PNG。');
      ctx.drawImage(renderer.domElement, 0, 0);
      const ratio = canvas.width / width();
      for (const label of labels.values()) {
        if (!label.visible) continue;
        const point = label.getWorldPosition(new THREE.Vector3()).project(camera);
        if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
        const x = ((point.x + 1) * canvas.width) / 2,
          y = ((1 - point.y) * canvas.height) / 2;
        const title = label.element.firstElementChild?.textContent ?? '',
          detail = label.element.lastElementChild?.textContent ?? '';
        ctx.font = `600 ${12 * ratio}px system-ui, sans-serif`;
        const labelWidth =
          Math.max(ctx.measureText(title).width, ctx.measureText(detail).width) + 20 * ratio;
        ctx.fillStyle = 'rgba(255,252,246,.94)';
        ctx.beginPath();
        ctx.roundRect(x - labelWidth / 2, y - 22 * ratio, labelWidth, 44 * ratio, 7 * ratio);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#443a32';
        ctx.fillText(title, x, y - 6 * ratio);
        ctx.font = `${10 * ratio}px system-ui, sans-serif`;
        ctx.fillStyle = '#756b61';
        ctx.fillText(detail, x, y + 10 * ratio);
      }
      if (selection && oldVisible !== undefined) selection.visible = oldVisible;
      invalidate();
      return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('PNG 导出失败。'))),
          'image/png',
        ),
      );
    },
    dispose() {
      if (disposed) return;
      cancelDrag();
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      fly = null;
      stopMotion();
      signalController.abort();
      resize.disconnect();
      walk.unlock();
      walk.removeEventListener('lock', syncLock);
      walk.removeEventListener('unlock', syncLock);
      walk.removeEventListener('change', invalidate);
      walk.dispose();
      orbit.removeEventListener('change', invalidate);
      orbit.removeEventListener('start', startOrbit);
      orbit.dispose();
      disposeSelection();
      labels.forEach((label) => {
        label.element.remove();
        scene.remove(label);
      });
      labels.clear();
      arch.dispose();
      clearGroup(furniture);
      models.clear();
      ground.geometry.dispose();
      ground.material.dispose();
      factory.dispose();
      sun.shadow.dispose();
      env.dispose();
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      for (const el of [renderer.domElement, labelRenderer.domElement, overlay, joy, exit, cross])
        el.remove();
    },
  };
}
