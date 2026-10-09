<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue';
import { BOUNDS, DOORS, ROOMS, SLIDES, WALLS } from './catalog';
import { aabb, area, bbox, norm, resizeFurniture, snapMove, snapRects } from './geometry';
import { dimensionsSvg, furnitureSvg, materialDefs, openingsSvg } from './svg';
import type { Furniture, Layers, PlanState, Point, Selection, Tool, Viewport } from './types';

const props = defineProps<{ state: PlanState; selection: Selection; tool: Tool; layers: Layers }>();
const emit = defineEmits<{
  select: [value: Selection];
  'begin-edit': [];
  'preview-furniture': [id: string, patch: Partial<Furniture>];
  'finish-edit': [cancel?: boolean];
  'add-measure': [measure: { a: Point; b: Point }];
  'toggle-wall': [id: string];
  notify: [message: string];
}>();
const svg = ref<SVGSVGElement>();
const size = reactive({ w: 1, h: 1 });
const viewport = reactive<Viewport>({ x0: BOUNDS.x, y0: BOUNDS.y, s: 0.04 });
const prefix = 'fp-' + useId().replace(/[^a-z0-9-]/gi, '') + '-';
const defs = materialDefs().replaceAll('id="', `id="${prefix}`);
const openings = openingsSvg(),
  dimensions = dimensionsSvg();
const sills = [...DOORS, ...SLIDES].map((d) => d.rect);
const viewBox = computed(
  () => `${viewport.x0} ${viewport.y0} ${size.w / viewport.s} ${size.h / viewport.s}`,
);
const selected = computed(() =>
  props.layers.furn && props.selection?.kind === 'furn'
    ? props.state.furniture.find((f) => f.id === props.selection?.id)
    : undefined,
);
const selectedRoom = computed(() =>
  props.selection?.kind === 'room' ? ROOMS.find((r) => r.id === props.selection?.id) : undefined,
);
const symbolCache = new Map<string, { signature: string; markup: string }>();
const furnMarkup = computed(() => {
  const present = new Set(props.state.furniture.map((f) => f.id));
  for (const id of symbolCache.keys()) if (!present.has(id)) symbolCache.delete(id);
  return new Map(
    props.state.furniture.map((f) => {
      const signature = `${f.type}:${f.w}:${f.d}:${f.color}`;
      let entry = symbolCache.get(f.id);
      if (entry?.signature !== signature) {
        entry = { signature, markup: furnitureSvg(f) };
        symbolCache.set(f.id, entry);
      }
      return [f.id, entry.markup];
    }),
  );
});
const noLabel = ['plant', 'floorlamp', 'sidetable', 'barstool', 'beanbag'];
const measureStart = ref<Point | null>(null),
  measureCursor = ref<Point | null>(null);
const cursor = ref<Point | null>(null),
  hoverRoom = ref('');
const panning = ref(false);
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const rotateOffset = computed(() => (coarse ? 40 : 26) / viewport.s);
const handleSize = computed(() => (coarse ? 9 : 6) / viewport.s);
const handleHit = computed(() => (coarse ? 24 : 12) / viewport.s);
const points = (poly: Point[]) => poly.map((p) => p.join(',')).join(' ');
const transform = (f: Furniture) => `translate(${f.cx} ${f.cy}) rotate(${f.rot})`;
const measureDrawing = computed(() =>
  [
    ...props.state.measures.map((m) => ({ ...m, temporary: false })),
    ...(measureStart.value && measureCursor.value
      ? [{ a: measureStart.value, b: measureCursor.value, temporary: true }]
      : []),
  ].map((m) => {
    const dx = m.b[0] - m.a[0],
      dy = m.b[1] - m.a[1],
      length = Math.hypot(dx, dy);
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;
    return {
      ...m,
      length,
      angle,
      x: (m.a[0] + m.b[0]) / 2,
      y: (m.a[1] + m.b[1]) / 2,
      nx: ((-dy / (length || 1)) * 5) / viewport.s,
      ny: ((dx / (length || 1)) * 5) / viewport.s,
    };
  }),
);

interface Drag {
  kind: 'move' | 'size' | 'rot' | 'pan' | 'measure';
  pointer: number;
  start: Point;
  origin: Point;
  f?: Furniture;
  offset?: Point;
  room?: string;
  moved: boolean;
}
let drag: Drag | null = null;
const touches = new Map<number, Point>();
let pinch: { distance: number; scale: number; anchor: Point } | null = null;
let observer: ResizeObserver | undefined,
  initialized = false;
function groundAt(clientX: number, clientY: number) {
  const r = svg.value?.getBoundingClientRect();
  if (
    !r ||
    !r.width ||
    !r.height ||
    clientX < r.left ||
    clientX > r.right ||
    clientY < r.top ||
    clientY > r.bottom
  )
    return null;
  return {
    x: viewport.x0 + (clientX - r.left) / viewport.s,
    y: viewport.y0 + (clientY - r.top) / viewport.s,
    s: viewport.s,
  };
}
function pointerPoint(e: PointerEvent): Point {
  const r = svg.value!.getBoundingClientRect();
  return [
    viewport.x0 + (e.clientX - r.left) / viewport.s,
    viewport.y0 + (e.clientY - r.top) / viewport.s,
  ];
}
function fit(roomId?: string) {
  if (!size.w || !size.h) return;
  const room = ROOMS.find((r) => r.id === roomId);
  const [x0, y0, x1, y1] = room
    ? bbox(room.poly)
    : [BOUNDS.x, BOUNDS.y, BOUNDS.x + BOUNDS.w, BOUNDS.y + BOUNDS.h];
  viewport.s =
    Math.min(size.w / (x1! - x0! + (room ? 800 : 0)), size.h / (y1! - y0! + (room ? 800 : 0))) *
    0.93;
  viewport.x0 = (x0! + x1!) / 2 - size.w / viewport.s / 2;
  viewport.y0 = (y0! + y1!) / 2 - size.h / viewport.s / 2;
}
function zoomAt(scale: number, x: number, y: number) {
  const ax = viewport.x0 + x / viewport.s,
    ay = viewport.y0 + y / viewport.s;
  viewport.s = Math.max(0.012, Math.min(2, scale));
  viewport.x0 = ax - x / viewport.s;
  viewport.y0 = ay - y / viewport.s;
}
function zoom(factor: number) {
  zoomAt(viewport.s * factor, size.w / 2, size.h / 2);
}
function wheel(e: WheelEvent) {
  const r = svg.value!.getBoundingClientRect();
  zoomAt(
    viewport.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)),
    e.clientX - r.left,
    e.clientY - r.top,
  );
}
function snapPoint(p: Point, shift: boolean): Point {
  let x = Math.round(p[0] / 10) * 10,
    y = Math.round(p[1] / 10) * 10,
    bx = 8 / viewport.s,
    by = bx;
  for (const r of snapRects(props.state)) {
    for (const ex of [r[0], r[2]])
      if (Math.abs(ex - p[0]) < bx) {
        bx = Math.abs(ex - p[0]);
        x = ex;
      }
    for (const ey of [r[1], r[3]])
      if (Math.abs(ey - p[1]) < by) {
        by = Math.abs(ey - p[1]);
        y = ey;
      }
  }
  if (shift && measureStart.value) {
    if (Math.abs(x - measureStart.value[0]) > Math.abs(y - measureStart.value[1]))
      y = measureStart.value[1];
    else x = measureStart.value[0];
  }
  return [x, y];
}
function finishMeasure() {
  if (
    measureStart.value &&
    measureCursor.value &&
    Math.hypot(
      measureCursor.value[0] - measureStart.value[0],
      measureCursor.value[1] - measureStart.value[1],
    ) > 20
  )
    emit('add-measure', { a: [...measureStart.value], b: [...measureCursor.value] });
  measureStart.value = measureCursor.value = null;
}
function endDrag(cancel = false) {
  const d = drag;
  drag = null;
  panning.value = false;
  if (!d) return;
  if (d.f) {
    if (d.moved) emit('finish-edit', cancel);
    return;
  }
  if (d.kind === 'measure') {
    if (cancel) measureStart.value = measureCursor.value = null;
    else if (d.moved) finishMeasure();
    return;
  }
  if (!cancel && !d.moved && props.tool === 'select')
    emit('select', d.room ? { kind: 'room', id: d.room } : null);
}
function cancelGesture() {
  endDrag(true);
  measureStart.value = measureCursor.value = null;
  touches.clear();
  pinch = null;
}
function pinchInfo() {
  const [a, b] = [...touches.values()];
  const r = svg.value!.getBoundingClientRect();
  return {
    distance: Math.max(1, Math.hypot(b![0] - a![0], b![1] - a![1])),
    x: (a![0] + b![0]) / 2 - r.left,
    y: (a![1] + b![1]) / 2 - r.top,
  };
}
function pointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  if (e.pointerType !== 'mouse') touches.set(e.pointerId, [e.clientX, e.clientY]);
  svg.value!.setPointerCapture(e.pointerId);
  if (touches.size >= 2) {
    endDrag(true);
    measureStart.value = measureCursor.value = null;
    const p = pinchInfo();
    pinch = {
      distance: p.distance,
      scale: viewport.s,
      anchor: [viewport.x0 + p.x / viewport.s, viewport.y0 + p.y / viewport.s],
    };
    return;
  }
  if (pinch || drag) return;
  const p = pointerPoint(e),
    target = e.target as Element;
  if (props.tool === 'measure') {
    const q = snapPoint(p, e.shiftKey);
    if (measureStart.value) {
      measureCursor.value = q;
      finishMeasure();
      return;
    }
    measureStart.value = measureCursor.value = q;
    drag = {
      kind: 'measure',
      pointer: e.pointerId,
      start: [e.clientX, e.clientY],
      origin: p,
      moved: false,
    };
    return;
  }
  const wall = target.closest<SVGElement>('[data-wall]')?.dataset.wall;
  if (props.tool === 'demolish' && wall) {
    const type = WALLS[Number(wall.slice(1))]?.[4];
    if (type === 'b' || type === 'e')
      emit('notify', type === 'b' ? '承重墙不可拆除' : '外墙不可拆除');
    else emit('toggle-wall', wall);
    return;
  }
  const handle = target.closest<SVGElement>('[data-handle]')?.dataset.handle;
  const id = target.closest<SVGElement>('[data-fid]')?.dataset.fid;
  const f =
    props.tool === 'select' && props.layers.furn
      ? handle
        ? selected.value
        : props.state.furniture.find((item) => item.id === id)
      : undefined;
  if (f) {
    emit('select', { kind: 'furn', id: f.id });
    drag = {
      kind: handle === 'rot' ? 'rot' : handle === 'size' ? 'size' : 'move',
      pointer: e.pointerId,
      start: [e.clientX, e.clientY],
      origin: p,
      f: { ...f },
      offset: [p[0] - f.cx, p[1] - f.cy],
      moved: false,
    };
  } else
    drag = {
      kind: 'pan',
      pointer: e.pointerId,
      start: [e.clientX, e.clientY],
      origin: [viewport.x0, viewport.y0],
      room: target.closest<SVGElement>('[data-room]')?.dataset.room,
      moved: false,
    };
}
function pointerMove(e: PointerEvent) {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch) {
    if (touches.size < 2) return;
    const p = pinchInfo();
    viewport.s = Math.max(0.012, Math.min(2, (pinch.scale * p.distance) / pinch.distance));
    viewport.x0 = pinch.anchor[0] - p.x / viewport.s;
    viewport.y0 = pinch.anchor[1] - p.y / viewport.s;
    return;
  }
  const p = pointerPoint(e);
  cursor.value = p;
  const roomId = (e.target as Element).closest<SVGElement>('[data-room]')?.dataset.room;
  hoverRoom.value = roomId ? (props.state.rooms[roomId]?.name ?? '') : '';
  if (!drag) {
    if (measureStart.value) measureCursor.value = snapPoint(p, e.shiftKey);
    return;
  }
  if (drag.pointer !== e.pointerId) return;
  const far = Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) >= 4;
  if (!far && !drag.moved) return;
  if (!drag.moved && drag.f) emit('begin-edit');
  drag.moved = true;
  if (drag.kind === 'measure') {
    measureCursor.value = snapPoint(p, e.shiftKey);
    return;
  }
  if (drag.kind === 'pan') {
    panning.value = true;
    viewport.x0 = drag.origin[0] - (e.clientX - drag.start[0]) / viewport.s;
    viewport.y0 = drag.origin[1] - (e.clientY - drag.start[1]) / viewport.s;
    return;
  }
  const f = drag.f!;
  if (drag.kind === 'move') {
    const [cx, cy] = snapMove(
      f,
      p[0] - drag.offset![0],
      p[1] - drag.offset![1],
      viewport.s,
      props.state,
      props.layers.wallSnap,
    );
    emit('preview-furniture', f.id, { cx, cy });
  } else if (drag.kind === 'size') emit('preview-furniture', f.id, resizeFurniture(f, p));
  else {
    const a = (Math.atan2(p[1] - f.cy, p[0] - f.cx) * 180) / Math.PI + 90;
    emit('preview-furniture', f.id, { rot: norm(e.shiftKey ? a : Math.round(a / 15) * 15) });
  }
}
function pointerEnd(e: PointerEvent) {
  touches.delete(e.pointerId);
  if (pinch) {
    if (touches.size < 2) pinch = null;
    return;
  }
  if (drag?.pointer === e.pointerId) endDrag(e.type === 'pointercancel');
}
function doubleClick(e: MouseEvent) {
  if (props.tool !== 'select' || !props.layers.furn) return;
  const id = (e.target as Element).closest<SVGElement>('[data-fid]')?.dataset.fid;
  const f = props.state.furniture.find((f) => f.id === id);
  if (f) {
    emit('begin-edit');
    emit('preview-furniture', f.id, { rot: norm(f.rot + 90) });
    emit('finish-edit');
  }
}
function keydown(e: KeyboardEvent) {
  if (e.key === 'Escape') cancelGesture();
}
watch(() => props.tool, cancelGesture);
watch(
  () => props.layers.furn,
  (visible) => {
    if (!visible && props.selection?.kind === 'furn') {
      cancelGesture();
      emit('select', null);
    }
  },
);
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const r = entries[0]?.contentRect;
    if (!r || r.width <= 0 || r.height <= 0) return;
    const cx = viewport.x0 + size.w / viewport.s / 2,
      cy = viewport.y0 + size.h / viewport.s / 2;
    size.w = r.width;
    size.h = r.height;
    if (!initialized) {
      fit();
      initialized = true;
    } else {
      viewport.x0 = cx - size.w / viewport.s / 2;
      viewport.y0 = cy - size.h / viewport.s / 2;
    }
  });
  observer.observe(svg.value!);
  window.addEventListener('keydown', keydown);
});
onBeforeUnmount(() => {
  cancelGesture();
  observer?.disconnect();
  window.removeEventListener('keydown', keydown);
});
async function exportPng(): Promise<Blob> {
  if (!svg.value) throw new Error('画布尚未就绪');
  await document.fonts.ready;
  const clone = svg.value.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export-exclude]').forEach((el) => el.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', '3200');
  clone.setAttribute('height', String(Math.round((3200 * BOUNDS.h) / BOUNDS.w)));
  clone.setAttribute('viewBox', `${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.w} ${BOUNDS.h}`);
  clone.style.cssText = 'background:#fbf9f4;font-family:system-ui,sans-serif';
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 3200;
    canvas.height = Math.round((3200 * BOUNDS.h) / BOUNDS.w);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建导出画布');
    ctx.fillStyle = '#fbf9f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG 导出失败'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
defineExpose({ viewport, fit, zoom, groundAt, exportPng, cancelGesture });
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <div
    class="plan-canvas"
    :class="{ panning, measuring: tool === 'measure', demolishing: tool === 'demolish' }"
  >
    <svg
      ref="svg"
      :viewBox="viewBox"
      aria-label="户型平面编辑画布"
      role="img"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerEnd"
      @pointercancel="pointerEnd"
      @wheel.prevent="wheel"
      @dblclick="doubleClick"
      @contextmenu.prevent="cancelGesture"
    >
      <!-- 图案与图例只由内置目录和已验证的数值、颜色生成。用户名称由 Vue 文本节点输出。 -->
      <defs v-html="defs" />
      <rect
        x="-20000"
        y="-20000"
        width="55000"
        height="55000"
        :fill="layers.grid ? `url(#${prefix}grid)` : '#fbf9f4'"
      />
      <g>
        <polygon
          v-for="room in ROOMS"
          :key="room.id"
          :data-room="room.id"
          :points="points(room.poly)"
          :fill="`url(#${prefix}m-${state.rooms[room.id]?.mat ?? room.mat})`"
        />
        <rect
          v-for="(r, i) in sills"
          :key="i"
          :x="r[0]"
          :y="r[1]"
          :width="r[2] - r[0]"
          :height="r[3] - r[1]"
          fill="#e2dacb"
          stroke="#b9b0a0"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
          pointer-events="none"
        />
      </g>
      <g v-if="layers.furn">
        <g
          v-for="f in state.furniture"
          :key="f.id"
          :data-fid="f.id"
          :transform="transform(f)"
          class="furniture"
        >
          <g v-html="furnMarkup.get(f.id)" />
          <text
            v-if="Math.min(f.w, f.d) >= 380 && !noLabel.includes(f.type)"
            :transform="`rotate(${-f.rot})`"
            :font-size="Math.max(80, Math.min(170, Math.min(f.w, f.d) * 0.2))"
            text-anchor="middle"
            dominant-baseline="central"
            fill="#4a443c"
            opacity=".8"
            pointer-events="none"
          >
            {{ f.name }}
          </text>
        </g>
      </g>
      <g>
        <rect
          v-for="(w, i) in WALLS"
          :key="i"
          :data-wall="`w${i}`"
          :x="w[0]"
          :y="w[1]"
          :width="w[2] - w[0]"
          :height="w[3] - w[1]"
          :fill="
            state.demolished.includes(`w${i}`)
              ? '#f1d4c8'
              : w[4] === 'b'
                ? layers.bearing
                  ? '#b8412c'
                  : '#26241f'
                : w[4] === 'low'
                  ? '#e9e3d8'
                  : w[4] === 'e'
                    ? '#8f897d'
                    : '#a7a195'
          "
          :fill-opacity="state.demolished.includes(`w${i}`) ? 0.4 : 1"
          :stroke="
            state.demolished.includes(`w${i}`) ? '#c65b3a' : w[4] === 'low' ? '#8f897d' : 'none'
          "
          :stroke-dasharray="state.demolished.includes(`w${i}`) ? '5 3' : undefined"
          stroke-width="1.2"
          vector-effect="non-scaling-stroke"
        />
      </g>
      <g pointer-events="none" v-html="openings" />
      <g v-if="layers.labels" pointer-events="none">
        <g
          v-for="room in ROOMS.filter((r) => r.at)"
          :key="room.id"
          stroke="#fbf9f4"
          stroke-width="45"
          paint-order="stroke"
          stroke-linejoin="round"
          text-anchor="middle"
        >
          <text :x="room.at![0]" :y="room.at![1]" font-size="250" font-weight="600" fill="#2b2824">
            {{ state.rooms[room.id]?.name }}
          </text>
          <text :x="room.at![0]" :y="room.at![1] + 260" font-size="175" fill="#7d7366">
            {{ area(room.poly).toFixed(2) }} m²
          </text>
        </g>
      </g>
      <g v-if="layers.dims" pointer-events="none" v-html="dimensions" />
      <g pointer-events="none">
        <g
          v-for="(m, i) in measureDrawing"
          :key="i"
          :data-export-exclude="m.temporary ? '' : undefined"
          :stroke="m.temporary ? '#2f5d62' : '#b5653a'"
          stroke-width="1.5"
        >
          <line
            :x1="m.a[0]"
            :y1="m.a[1]"
            :x2="m.b[0]"
            :y2="m.b[1]"
            vector-effect="non-scaling-stroke"
          />
          <line
            v-for="(p, j) in [m.a, m.b]"
            :key="j"
            :x1="p[0] - m.nx"
            :y1="p[1] - m.ny"
            :x2="p[0] + m.nx"
            :y2="p[1] + m.ny"
            vector-effect="non-scaling-stroke"
          />
          <text
            :x="m.x"
            :y="m.y - 5 / viewport.s"
            :font-size="12 / viewport.s"
            :transform="`rotate(${m.angle} ${m.x} ${m.y})`"
            text-anchor="middle"
            :fill="m.temporary ? '#2f5d62' : '#b5653a'"
            font-weight="600"
            stroke="#fff"
            :stroke-width="3.5 / viewport.s"
            paint-order="stroke"
          >
            {{ Math.round(m.length) }} mm
          </text>
        </g>
      </g>
      <g data-export-exclude="">
        <polygon
          v-if="selectedRoom"
          :points="points(selectedRoom.poly)"
          fill="#b5653a"
          fill-opacity=".08"
          stroke="#b5653a"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          pointer-events="none"
        />
        <g v-if="selected" :transform="transform(selected)">
          <rect
            :x="-selected.w / 2 - 5 / viewport.s"
            :y="-selected.d / 2 - 5 / viewport.s"
            :width="selected.w + 10 / viewport.s"
            :height="selected.d + 10 / viewport.s"
            fill="none"
            stroke="#b5653a"
            stroke-width="1.5"
            stroke-dasharray="5 3"
            vector-effect="non-scaling-stroke"
            pointer-events="none"
          />
          <line
            x1="0"
            :y1="-selected.d / 2 - 5 / viewport.s"
            x2="0"
            :y2="-selected.d / 2 - rotateOffset"
            stroke="#b5653a"
            vector-effect="non-scaling-stroke"
            pointer-events="none"
          />
          <circle
            data-handle="rot"
            cx="0"
            :cy="-selected.d / 2 - rotateOffset"
            :r="handleHit"
            fill="transparent"
          />
          <circle
            data-handle="rot"
            cx="0"
            :cy="-selected.d / 2 - rotateOffset"
            :r="handleSize"
            fill="#fff"
            stroke="#b5653a"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          >
            <title>拖动旋转，Shift 自由角度</title>
          </circle>
          <circle
            data-handle="size"
            :cx="selected.w / 2"
            :cy="selected.d / 2"
            :r="handleHit"
            fill="transparent"
          />
          <rect
            data-handle="size"
            :x="selected.w / 2 - handleSize"
            :y="selected.d / 2 - handleSize"
            :width="handleSize * 2"
            :height="handleSize * 2"
            fill="#b5653a"
          >
            <title>拖动调整尺寸</title>
          </rect>
        </g>
        <text
          v-if="selected"
          :x="selected.cx"
          :y="selected.cy + aabb(selected).hh + 24 / viewport.s"
          :font-size="12 / viewport.s"
          text-anchor="middle"
          fill="#b5653a"
          font-weight="600"
          pointer-events="none"
          stroke="#fff"
          :stroke-width="3 / viewport.s"
          paint-order="stroke"
        >
          {{ selected.w }} × {{ selected.d }}
        </text>
      </g>
    </svg>
    <div class="plan-canvas-status" aria-hidden="true">
      <span v-if="hoverRoom">{{ hoverRoom }}</span
      ><span v-if="cursor">{{ Math.round(cursor[0]) }} , {{ Math.round(cursor[1]) }} mm</span>
    </div>
  </div>
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
.plan-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #fbf9f4;
}
svg {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  user-select: none;
  font-family: system-ui, sans-serif;
  cursor: grab;
}
.panning svg {
  cursor: grabbing;
}
.measuring svg {
  cursor: crosshair;
}
.demolishing svg {
  cursor: pointer;
}
.furniture {
  cursor: move;
}
.plan-canvas-status {
  position: absolute;
  bottom: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  max-width: calc(100% - 244px);
  gap: 2px;
  color: #7d7366;
  font-size: 10px;
  pointer-events: none;
}
.plan-canvas-status span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
