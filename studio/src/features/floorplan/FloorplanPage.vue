<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowsMaximize,
  IconBed,
  IconBox,
  IconBuilding,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconFilePlus,
  IconFolderOpen,
  IconHome,
  IconHelpCircle,
  IconLayersIntersect,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconMoon,
  IconPointer,
  IconRulerMeasure,
  IconSettings,
  IconSun,
  IconTrash,
  IconWalk,
  IconWall,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-vue';
import StudioLogo from '@/components/StudioLogo.vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import { useTheme } from '@/composables/useTheme';
import { downloadBlob } from '@/core/browser/download';
import { receiveWindowFileHandoff, useFileHandoff } from '@/core/browser/file-handoff';
import PlanCanvas from './PlanCanvas.vue';
import FurnitureInspector from './FurnitureInspector.vue';
import FurnitureLibrary from './FurnitureLibrary.vue';
import FloorplanSearch from './FloorplanSearch.vue';
import { useFloorplan } from './useFloorplan';
import { MATS, ROOMS } from './catalog';
import { area, bbox, perim, pointInPolygon, roomPoint, snapMove } from './geometry';
import { parsePlanFile, serializePlanFile } from './files';
import { furnitureSvg } from './svg';
import type { FloorplanScene, Layers, LibraryItem, SceneOptions, Selection, Tool } from './types';
import './floorplan.css';

const editor = useFloorplan();
const { active, documents, state, ready, error, dirty, selection, furniture, canUndo, canRedo } =
  editor;
const { resolved: theme, toggle: toggleTheme } = useTheme();
const { take: takeHandoff, currentHandoff } = useFileHandoff();
const canvas = ref<InstanceType<typeof PlanCanvas> | null>(null);
const sceneHost = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLDialogElement | null>(null);
const mode = ref<'2d' | '3d'>('2d');
const busy = ref(false);
const exportBusy = ref(false);
const tool = ref<Tool>('select');
const layers = reactive<Layers>({
  dims: true,
  labels: true,
  furn: true,
  grid: false,
  bearing: false,
  wallSnap: true,
});
const panes = reactive({ rooms: true, inspector: true, library: true });
const options = reactive<SceneOptions>({
  cut: 2.8,
  furn: true,
  labels: true,
  night: false,
  hour: 10,
  mode: 'orbit',
});
const popover = ref<'plans' | 'export' | 'layers' | 'more' | 'help' | null>(null);
const headerVisible = ref(true);
const HEADER_PREFERENCE_KEY = `${STORAGE_POLICY.namespace('floorplan')}:header-collapsed`;

function toggleHeader() {
  headerVisible.value = !headerVisible.value;
  popover.value = null;
  if (!storageAvailable()) return;
  try {
    if (headerVisible.value) localStorage.removeItem(HEADER_PREFERENCE_KEY);
    else localStorage.setItem(HEADER_PREFERENCE_KEY, 'true');
  } catch {
    // 本地偏好不可用时保留当前页面状态。
  }
}
const documentSearch = ref('');
const titleDraft = ref('');
const notification = ref('');
const modal = ref<{
  title: string;
  body: string;
  action: () => void | Promise<unknown>;
  confirm: string;
} | null>(null);
const dragGhost = ref<{
  item: LibraryItem;
  x: number;
  y: number;
  scale: number;
  valid: boolean;
} | null>(null);
const PREF_KEY = 'meowv-studio:floorplan:v1:preferences';
let scene: FloorplanScene | null = null;
let sceneGeneration = 0;
let disposed = false;
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
let receiveCleanup: (() => void) | undefined;
const walking = computed(() => mode.value === '3d' && options.mode === 'walk');
const room = computed(() =>
  selection.value?.kind === 'room' ? ROOMS.find((r) => r.id === selection.value?.id) : undefined,
);
const furnitureRoom = computed(() =>
  furniture.value
    ? ROOMS.find((r) => pointInPolygon([furniture.value!.cx, furniture.value!.cy], r.poly))
    : undefined,
);
const currentRoomId = computed(() => room.value?.id ?? furnitureRoom.value?.id);
const currentRoomName = computed(() =>
  furnitureRoom.value ? state.value.rooms[furnitureRoom.value.id].name : '房间外',
);
const totalArea = ROOMS.filter((r) => r.counted !== false).reduce(
  (sum, r) => sum + area(r.poly),
  0,
);
const estimate = computed(
  () =>
    ROOMS.reduce((sum, r) => sum + area(r.poly) * MATS[state.value.rooms[r.id].mat].price, 0) *
    1.05,
);
const roomFurniture = computed(() =>
  room.value
    ? state.value.furniture.filter((f) => pointInPolygon([f.cx, f.cy], room.value!.poly))
    : [],
);
const roomBounds = computed(() => (room.value ? bbox(room.value.poly) : [0, 0, 0, 0]));
const filteredDocuments = computed(() =>
  documents.value.filter((d) => d.title.includes(documentSearch.value.trim())),
);
const hourLabel = computed(
  () =>
    `${String(Math.floor(options.hour)).padStart(2, '0')}:${String(Math.round((options.hour % 1) * 60)).padStart(2, '0')}`,
);
const layerLabels: { key: keyof Layers; label: string }[] = [
  { key: 'dims', label: '户型尺寸' },
  { key: 'labels', label: '房间名称' },
  { key: 'furn', label: '家具' },
  { key: 'grid', label: '参考网格' },
  { key: 'bearing', label: '承重墙高亮' },
  { key: 'wallSnap', label: '贴墙吸附' },
];
function notify(message: string) {
  notification.value = message;
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    notification.value = '';
  }, 4200);
}
function select(value: Selection) {
  selection.value = value;
  if (value) panes.inspector = true;
}
function focusRoom(id?: string) {
  select(id ? { kind: 'room', id } : null);
  if (mode.value === '3d') scene?.focusRoom(id);
  else canvas.value?.fit(id);
}
function togglePopover(value: typeof popover.value) {
  popover.value = popover.value === value ? null : value;
}
function cancelGesture() {
  canvas.value?.cancelGesture();
  editor.finishEdit(true);
  dragGhost.value = null;
}
function setTool(value: Tool) {
  cancelGesture();
  tool.value = value;
  if (mode.value === '3d') void setMode('2d');
}
async function setMode(value: '2d' | '3d') {
  if (mode.value === value && !busy.value) return;
  cancelGesture();
  popover.value = null;
  const generation = ++sceneGeneration;
  scene?.dispose();
  scene = null;
  options.mode = 'orbit';
  mode.value = value;
  if (value === '2d') {
    busy.value = false;
    await nextTick();
    return;
  }
  tool.value = 'select';
  busy.value = true;
  try {
    const module = await import('./scene');
    await nextTick();
    if (disposed || generation !== sceneGeneration || !sceneHost.value) return;
    scene = module.createFloorplanScene(sceneHost.value, {
      getState: () => state.value,
      getSelection: () => selection.value,
      getViewport: () => canvas.value?.viewport ?? { x0: -1850, y0: -1750, s: 0.06 },
      select,
      beginEdit: editor.beginEdit,
      previewFurniture: editor.previewFurniture,
      finishEdit: editor.finishEdit,
      snapMove: (f, x, y, s) => snapMove(f, x, y, s, state.value, layers.wallSnap),
      notify,
      onMode: (value) => {
        options.mode = value;
      },
    });
    scene.setOptions({ ...options, furn: layers.furn, labels: layers.labels });
    scene.update();
  } catch (cause) {
    if (generation !== sceneGeneration) return;
    scene?.dispose();
    scene = null;
    mode.value = '2d';
    notify(`3D 暂时无法打开，已返回平面图。${cause instanceof Error ? cause.message : ''}`);
  } finally {
    if (generation === sceneGeneration) busy.value = false;
  }
}
function walk() {
  if (busy.value) return;
  options.mode = options.mode === 'walk' ? 'orbit' : 'walk';
}
function topView() {
  scene?.topView();
}
watch(options, () => scene?.setOptions({ ...options, furn: layers.furn, labels: layers.labels }));
watch(
  () => editor.changeVersion.value,
  () => scene?.update(),
);
watch(selection, () => scene?.update());
watch(layers, () => {
  if (!layers.furn && selection.value?.kind === 'furn') selection.value = null;
  scene?.setOptions({ furn: layers.furn, labels: layers.labels });
  savePreferences();
});
watch(panes, savePreferences);
watch(
  () => active.value.id,
  () => {
    titleDraft.value = active.value.title;
    cancelGesture();
    scene?.update();
    void nextTick(() => canvas.value?.fit());
  },
);
function savePreferences() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ layers, panes }));
  } catch {
    /* 不影响当前编辑。 */
  }
}
function loadPreferences() {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return;
    const prefs = raw as Record<string, unknown>;
    for (const [name, target] of [
      ['layers', layers],
      ['panes', panes],
    ] as const) {
      const source = prefs[name];
      if (source && typeof source === 'object')
        for (const key of Object.keys(target)) {
          const value = (source as Record<string, unknown>)[key];
          if (typeof value === 'boolean')
            (target as unknown as Record<string, boolean>)[key] = value;
        }
    }
  } catch {
    /* 损坏的偏好使用默认值。 */
  }
}
function groundAt(x: number, y: number) {
  const rect = stage.value?.getBoundingClientRect();
  if (
    !rect ||
    x < rect.left ||
    x > rect.right ||
    y < rect.top ||
    y > rect.bottom ||
    busy.value ||
    walking.value
  )
    return null;
  return mode.value === '3d'
    ? (scene?.groundAt(x, y) ?? null)
    : (canvas.value?.groundAt(x, y) ?? null);
}
function addItem(item: LibraryItem) {
  if (walking.value || busy.value) return;
  if (room.value) {
    editor.addFurniture(item, roomPoint(room.value));
    return;
  }
  const rect = stage.value?.getBoundingClientRect();
  if (!rect) return;
  const point = groundAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (!point) {
    notify('请调整视角，让添加位置落在可见地面上。');
    return;
  }
  layers.furn = true;
  editor.addFurniture(item, [point.x, point.y]);
}
function dropItem(item: LibraryItem, x: number, y: number) {
  const point = groundAt(x, y);
  dragGhost.value = null;
  if (!point) {
    notify('请将家具放到画布中的可见地面。');
    return;
  }
  layers.furn = true;
  editor.addFurniture(item, [point.x, point.y]);
}
function hoverItem(item: LibraryItem | null, x: number, y: number) {
  const point = item ? groundAt(x, y) : null;
  dragGhost.value = item ? { item, x, y, scale: point?.s ?? 0.06, valid: Boolean(point) } : null;
}
function ghostSvg(item: LibraryItem) {
  return furnitureSvg({
    id: 'ghost',
    type: item[0],
    name: item[1],
    w: item[2],
    d: item[3],
    color: item[4],
    cx: 0,
    cy: 0,
    rot: 0,
  });
}
function toggleWall(id: string) {
  if (!editor.toggleWall(id)) notify('承重墙和外墙不可拆除。');
}
function roomNameChange(event: Event) {
  if (!room.value) return;
  const input = event.target as HTMLInputElement,
    name = input.value.trim().slice(0, 120),
    id = room.value.id;
  if (!name) {
    input.value = state.value.rooms[id].name;
    return;
  }
  editor.mutate((s) => {
    s.rooms[id].name = name;
  });
}
function materialChange(event: Event) {
  const id = room.value?.id,
    mat = (event.target as HTMLSelectElement).value;
  if (id && MATS[mat])
    editor.mutate((s) => {
      s.rooms[id].mat = mat;
    });
}
async function ask(
  title: string,
  body: string,
  action: () => void | Promise<unknown>,
  confirm = '确认',
) {
  popover.value = null;
  modal.value = { title, body, action, confirm };
  await nextTick();
  dialog.value?.showModal();
}
function closeModal() {
  dialog.value?.close();
  modal.value = null;
}
async function confirmModal() {
  const action = modal.value?.action;
  closeModal();
  await action?.();
}
async function switchPlan(id: string) {
  cancelGesture();
  if (await editor.switchDocument(id)) {
    popover.value = null;
    if (mode.value === '3d') await setMode('2d');
  }
}
async function newPlan() {
  cancelGesture();
  if (await editor.addDocument()) {
    popover.value = null;
    await setMode('2d');
  }
}
async function copyPlan() {
  if (await editor.copyDocument()) {
    popover.value = null;
    notify('已创建方案副本。');
  }
}
async function importFile(file: File) {
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('方案文件不能超过 10 MB。');
    const doc = parsePlanFile(await file.text(), file.name);
    cancelGesture();
    if (await editor.addDocument(doc)) {
      await setMode('2d');
      notify('方案已导入。');
    }
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '无法读取此方案文件。');
  }
}
function fileChanged(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void importFile(file);
}
function exportJson() {
  downloadBlob(
    new Blob([serializePlanFile(active.value)], { type: 'application/json' }),
    `${safeName()}.floorplan.json`,
  );
  popover.value = null;
}
function safeName() {
  return active.value.title.replace(/[\\/:*?"<>|]/g, '_') || '户型设计';
}
async function exportPng() {
  popover.value = null;
  exportBusy.value = true;
  try {
    const blob = mode.value === '3d' ? await scene?.exportPng() : await canvas.value?.exportPng();
    if (!blob) throw new Error('画面尚未准备好。');
    downloadBlob(blob, `${safeName()}-${mode.value}.png`);
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '图片导出失败，请重试。');
  } finally {
    exportBusy.value = false;
  }
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (modal.value) return;
    popover.value = null;
    cancelGesture();
    if (tool.value !== 'select') tool.value = 'select';
    return;
  }
  if (
    modal.value ||
    busy.value ||
    walking.value ||
    (event.target instanceof HTMLElement &&
      event.target.closest('input,textarea,select,[contenteditable="true"]'))
  )
    return;
  const key = event.key.toLowerCase(),
    mod = event.metaKey || event.ctrlKey;
  if (mod && key === 'z') {
    event.preventDefault();
    cancelGesture();
    if (event.shiftKey) editor.redo();
    else editor.undo();
  } else if (mod && key === 'y') {
    event.preventDefault();
    cancelGesture();
    editor.redo();
  } else if (mod && key === 'd') {
    event.preventDefault();
    editor.duplicateFurniture();
  } else if (mod && key === 's') {
    event.preventDefault();
    void editor.flush();
  } else if (!mod && (key === 'delete' || key === 'backspace')) {
    event.preventDefault();
    editor.removeFurniture();
  } else if (!mod && key === 'r') editor.rotate(event.shiftKey ? -15 : 15);
  else if (!mod && key === 'v') setTool('select');
  else if (!mod && key === 'm') setTool('measure');
  else if (!mod && key === 'f') focusRoom();
  else if (!mod && key === '[') panes.library = !panes.library;
  else if (!mod && key === ']') panes.inspector = !panes.inspector;
  else if (
    !mod &&
    ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) &&
    furniture.value
  ) {
    event.preventDefault();
    const step = event.shiftKey ? 100 : 10;
    editor.patchFurniture({
      cx: furniture.value.cx + (key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0),
      cy: furniture.value.cy + (key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0),
    });
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
function pageVisibility() {
  if (document.hidden) {
    cancelGesture();
    void editor.flush();
  }
}
onBeforeRouteLeave(async () => {
  cancelGesture();
  if (await editor.flush()) return true;
  return window.confirm('当前方案尚未保存成功。确定离开？建议先导出 JSON 备份。');
});
onMounted(async () => {
  if (storageAvailable()) {
    try {
      headerVisible.value = localStorage.getItem(HEADER_PREFERENCE_KEY) !== 'true';
    } catch {
      // 本地偏好不可用时默认展开顶部栏。
    }
  }
  loadPreferences();
  window.addEventListener('keydown', keydown);
  window.addEventListener('beforeunload', beforeUnload);
  document.addEventListener('visibilitychange', pageVisibility);
  await editor.initialize();
  if (disposed) return;
  titleDraft.value = active.value.title;
  await nextTick();
  canvas.value?.fit();
  const file = takeHandoff('floorplan');
  if (file) await importFile(file);
  receiveCleanup = receiveWindowFileHandoff('floorplan', (file) => {
    void importFile(file);
  });
});
watch(currentHandoff, () => {
  if (!ready.value) return;
  const file = takeHandoff('floorplan');
  if (file) void importFile(file);
});
onBeforeUnmount(() => {
  disposed = true;
  sceneGeneration++;
  scene?.dispose();
  scene = null;
  receiveCleanup?.();
  clearTimeout(notifyTimer);
  window.removeEventListener('keydown', keydown);
  window.removeEventListener('beforeunload', beforeUnload);
  document.removeEventListener('visibilitychange', pageVisibility);
});
</script>

<!-- eslint-disable vue/no-v-html -- furniture SVG markup is generated solely from the fixed internal catalogue. -->
<template>
  <main
    class="fp-app"
    :class="{ 'is-walking': walking, 'fp-header-collapsed': !headerVisible }"
    @pointerdown="
      popover && !($event.target as HTMLElement).closest('.fp-popover-anchor') && (popover = null)
    "
  >
    <header v-show="headerVisible" class="fp-header">
      <div class="fp-header-brand">
        <StudioLogo />
        <h1>户型设计</h1>
      </div>
      <span class="fp-header-divider fp-hide-small"></span>
      <div class="fp-popover-anchor fp-plan-switch">
        <button
          :aria-expanded="popover === 'plans'"
          aria-label="管理方案"
          @click="togglePopover('plans')"
        >
          <span>{{ active.title }}</span
          ><IconChevronDown :size="16" />
        </button>
        <div v-if="popover === 'plans'" class="fp-popover fp-plans">
          <h2>我的方案</h2>
          <FloorplanSearch v-model="documentSearch" label="搜索方案" />
          <div class="fp-plan-list">
            <button
              v-for="doc in filteredDocuments"
              :key="doc.id"
              :class="{ selected: doc.id === active.id }"
              @click="switchPlan(doc.id)"
            >
              <IconHome :size="18" /><span
                >{{ doc.title
                }}<small>{{ new Date(doc.updatedAt).toLocaleDateString('zh-CN') }}</small></span
              >
            </button>
          </div>
          <div class="fp-menu-actions">
            <button @click="newPlan"><IconFilePlus :size="17" />新建方案</button
            ><button @click="copyPlan"><IconCopy :size="17" />复制当前方案</button
            ><button
              @click="
                fileInput?.click();
                popover = null;
              "
            >
              <IconFolderOpen :size="17" />导入方案
            </button>
          </div>
          <label class="fp-field"
            >当前方案名称<input
              v-model="titleDraft"
              maxlength="120"
              @change="editor.rename(titleDraft)" /></label
          ><button
            class="fp-danger"
            @click="
              ask(
                '删除方案',
                `删除「${active.title}」后无法恢复。`,
                editor.removeDocument,
                '删除方案',
              )
            "
          >
            <IconTrash :size="17" />删除当前方案
          </button>
        </div>
      </div>
      <div class="fp-header-spacer"></div>
      <div class="fp-view-tabs" aria-label="视图">
        <button
          :class="{ active: mode === '2d' }"
          :aria-pressed="mode === '2d'"
          @click="setMode('2d')"
        >
          2D</button
        ><button
          :class="{ active: mode === '3d' }"
          :aria-pressed="mode === '3d'"
          @click="setMode('3d')"
        >
          3D
        </button>
      </div>
      <button
        class="fp-theme-button"
        :title="theme === 'dark' ? '切换浅色主题' : '切换深色主题'"
        :aria-label="theme === 'dark' ? '切换浅色主题' : '切换深色主题'"
        @click="toggleTheme"
      >
        <component :is="theme === 'dark' ? IconSun : IconMoon" :size="19" />
      </button>
      <div class="fp-popover-anchor">
        <button
          class="fp-primary fp-export"
          :disabled="exportBusy || busy"
          :aria-expanded="popover === 'export'"
          @click="togglePopover('export')"
        >
          <IconDownload :size="17" /><span>{{ exportBusy ? '导出中…' : '导出' }}</span
          ><IconChevronDown :size="15" />
        </button>
        <div v-if="popover === 'export'" class="fp-popover fp-align-right">
          <button @click="exportJson">方案文件 (.floorplan.json)</button
          ><button @click="exportPng">
            {{ mode === '3d' ? '当前 3D 视角' : '完整平面图' }} (.png)
          </button>
        </div>
      </div>
    </header>
    <studio-header-toggle :visible="headerVisible" @click="toggleHeader" />
    <div v-if="error" class="fp-storage-error" role="alert">
      <span>{{ error }}</span
      ><button @click="editor.flush()">重试保存</button><button @click="exportJson">导出备份</button
      ><button @click="copyPlan">另存副本</button
      ><button
        @click="
          ask(
            '重新载入方案',
            '当前未保存的修改将被本地已保存的版本替换。',
            editor.reloadRemote,
            '重新载入',
          )
        "
      >
        载入已保存版本
      </button>
    </div>
    <div
      class="fp-workspace"
      :class="{
        'rooms-hidden': !panes.rooms || walking,
        'inspector-hidden': !panes.inspector || walking,
      }"
    >
      <aside v-show="panes.rooms && !walking" class="fp-rooms" aria-label="房间列表">
        <div class="fp-panel-heading">
          <h2>房间</h2>
          <button aria-label="收起房间列表" title="收起房间列表" @click="panes.rooms = false">
            <IconLayoutSidebar :size="17" />
          </button>
        </div>
        <button class="fp-room-button" :class="{ selected: !selection }" @click="focusRoom()">
          <IconHome :size="20" /><span>全屋概览</span></button
        ><button
          v-for="r in ROOMS.filter((r) => r.counted !== false)"
          :key="r.id"
          class="fp-room-button"
          :class="{ selected: currentRoomId === r.id }"
          @click="focusRoom(r.id)"
        >
          <component
            :is="['master', 'child', 'kid'].includes(r.id) ? IconBed : IconBuilding"
            :size="21"
          /><span
            >{{ state.rooms[r.id].name }}<small>{{ area(r.poly).toFixed(2) }} m²</small></span
          >
        </button>
        <div class="fp-room-group">飘窗</div>
        <button
          v-for="r in ROOMS.filter((r) => r.counted === false)"
          :key="r.id"
          class="fp-room-button"
          :class="{ selected: currentRoomId === r.id }"
          @click="focusRoom(r.id)"
        >
          <IconBox :size="20" /><span>{{ state.rooms[r.id].name }}</span>
        </button>
        <div class="fp-rooms-footer">{{ totalArea.toFixed(2) }} m² <span>套内使用面积</span></div>
      </aside>
      <section ref="stage" class="fp-stage" aria-label="户型画布">
        <PlanCanvas
          v-if="ready"
          v-show="mode === '2d'"
          ref="canvas"
          :state="state"
          :selection="selection"
          :tool="tool"
          :layers="layers"
          @select="select"
          @begin-edit="editor.beginEdit"
          @preview-furniture="editor.previewFurniture"
          @finish-edit="editor.finishEdit"
          @add-measure="(measurement) => editor.mutate((s) => s.measures.push(measurement))"
          @toggle-wall="toggleWall"
          @notify="notify"
        />
        <div v-show="mode === '3d'" ref="sceneHost" class="fp-scene"></div>
        <div v-if="busy || !ready" class="fp-loading" role="status">
          {{ busy ? '正在准备 3D 场景…' : '正在打开方案…' }}
        </div>
        <div class="fp-canvas-toolbar" aria-label="画布工具">
          <button
            v-if="!panes.rooms && !walking"
            title="展开房间列表"
            aria-label="展开房间列表"
            @click="panes.rooms = true"
          >
            <IconLayoutSidebar :size="19" />
          </button>
          <template v-if="mode === '2d'"
            ><button
              :class="{ active: tool === 'select' }"
              :aria-pressed="tool === 'select'"
              title="选择 (V)"
              @click="setTool('select')"
            >
              <IconPointer :size="18" /><span>选择</span></button
            ><button
              :class="{ active: tool === 'measure' }"
              :aria-pressed="tool === 'measure'"
              title="测量 (M)"
              @click="setTool('measure')"
            >
              <IconRulerMeasure :size="18" /><span>测量</span></button
            ><button
              :class="{ active: tool === 'demolish' }"
              :aria-pressed="tool === 'demolish'"
              title="拆除或恢复非承重墙"
              @click="setTool('demolish')"
            >
              <IconWall :size="18" /><span>拆墙</span>
            </button></template
          >
          <template v-else
            ><button :class="{ active: walking }" :disabled="busy" @click="walk">
              <IconWalk :size="18" /><span>{{ walking ? '退出漫游' : '漫游' }}</span></button
            ><button v-if="!walking" title="俯视" @click="topView">
              <IconLayersIntersect :size="18" /><span>俯视</span>
            </button></template
          >
          <span v-if="!walking" class="fp-toolbar-divider"></span
          ><button
            v-if="!walking"
            title="撤销 (⌘/Ctrl Z)"
            aria-label="撤销"
            :disabled="!canUndo"
            @click="
              cancelGesture();
              editor.undo();
            "
          >
            <IconArrowBackUp :size="19" /></button
          ><button
            v-if="!walking"
            title="重做 (⌘/Ctrl Shift Z)"
            aria-label="重做"
            :disabled="!canRedo"
            @click="
              cancelGesture();
              editor.redo();
            "
          >
            <IconArrowForwardUp :size="19" />
          </button>
          <button
            v-if="!panes.inspector && !walking"
            title="展开属性面板"
            aria-label="展开属性面板"
            @click="panes.inspector = true"
          >
            <IconLayoutSidebarRight :size="19" />
          </button>
        </div>
        <div v-if="mode === '3d' && !walking" class="fp-scene-options">
          <label
            ><input
              v-model.number="options.cut"
              type="checkbox"
              :true-value="1.2"
              :false-value="2.8"
            />半高墙</label
          ><button :class="{ active: options.night }" @click="options.night = !options.night">
            <component :is="options.night ? IconMoon : IconSun" :size="17" />{{
              options.night ? '夜景' : '日照'
            }}</button
          ><label v-if="!options.night" class="fp-sun-range"
            ><input
              v-model.number="options.hour"
              aria-label="日照时间"
              type="range"
              min="7"
              max="18"
              step="0.25"
            /><span>{{ hourLabel }}</span></label
          >
        </div>
        <div v-if="!walking" class="fp-canvas-bottom">
          <div class="fp-view-actions">
            <div class="fp-popover-anchor fp-help-anchor">
              <button
                title="操作帮助"
                aria-label="操作帮助"
                :aria-expanded="popover === 'help'"
                @click="togglePopover('help')"
              >
                <IconHelpCircle :size="18" />
              </button>
              <div
                v-if="popover === 'help'"
                class="fp-popover fp-popover-up fp-align-right fp-operation-help"
              >
                <h3>操作帮助</h3>
                <p>
                  {{
                    mode === '3d'
                      ? '拖动旋转 · 滚轮缩放 · 点选后拖动家具'
                      : tool === 'measure'
                        ? '点击两个端点或拖动测量 · Shift 正交 · Esc 取消'
                        : tool === 'demolish'
                          ? '点击非承重墙拆除 / 恢复'
                          : '拖动家具 · 空白处平移 · 滚轮缩放'
                  }}
                </p>
              </div>
            </div>
            <div class="fp-popover-anchor">
              <button title="图层和吸附" aria-label="图层和吸附" @click="togglePopover('layers')">
                <IconLayersIntersect :size="18" />
              </button>
              <div v-if="popover === 'layers'" class="fp-popover fp-popover-up fp-align-right">
                <h3>图层与吸附</h3>
                <label v-for="item in layerLabels" :key="item.key" class="fp-check"
                  ><input v-model="layers[item.key]" type="checkbox" />{{ item.label }}</label
                ><small>参考网格与 10 mm 移动吸附独立。</small>
              </div>
            </div>
            <button v-if="mode === '2d'" title="缩小" aria-label="缩小" @click="canvas?.zoom(0.8)">
              <IconZoomOut :size="18" /></button
            ><button
              v-if="mode === '2d'"
              title="放大"
              aria-label="放大"
              @click="canvas?.zoom(1.25)"
            >
              <IconZoomIn :size="18" /></button
            ><button title="适应全屋 (F)" aria-label="适应全屋" @click="focusRoom()">
              <IconArrowsMaximize :size="18" />
            </button>
            <div class="fp-popover-anchor">
              <button title="更多操作" aria-label="更多操作" @click="togglePopover('more')">
                <IconSettings :size="18" />
              </button>
              <div v-if="popover === 'more'" class="fp-popover fp-popover-up fp-align-right">
                <button
                  @click="
                    fileInput?.click();
                    popover = null;
                  "
                >
                  导入 JSON 方案</button
                ><button
                  :disabled="!state.measures.length"
                  @click="
                    editor.mutate((s) => (s.measures = []));
                    popover = null;
                  "
                >
                  清除测量线</button
                ><button
                  @click="
                    ask(
                      '清空家具',
                      '移除当前方案的全部家具，可通过撤销恢复。',
                      () => editor.mutate((s) => (s.furniture = [])),
                      '清空家具',
                    )
                  "
                >
                  清空家具</button
                ><button
                  @click="
                    ask(
                      '恢复原始布局',
                      '当前方案将恢复原始家具、材料、墙体和测量设置，可通过撤销恢复。',
                      editor.reset,
                      '恢复原始布局',
                    )
                  "
                >
                  恢复原始布局</button
                ><button
                  @click="
                    ask(
                      '键盘快捷键',
                      'V 选择 · M 测量 · F 全屋 · R 旋转15° · Shift R反向旋转 · 方向键移动10mm（Shift 100mm） · ⌘/Ctrl D复制 · Delete删除 · ⌘/Ctrl Z撤销 · [ 家具库 · ] 属性面板',
                      () => {},
                      '知道了',
                    )
                  "
                >
                  键盘快捷键
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <aside v-show="panes.inspector && !walking" class="fp-inspector" aria-label="属性面板">
        <button
          class="fp-inspector-close"
          title="收起属性面板"
          aria-label="收起属性面板"
          @click="panes.inspector = false"
        >
          <IconLayoutSidebarRight :size="17" />
        </button>
        <FurnitureInspector
          v-if="furniture"
          :key="furniture.id"
          :furniture="furniture"
          :room-name="currentRoomName"
          @patch="editor.patchFurniture"
          @duplicate="editor.duplicateFurniture"
          @remove="editor.removeFurniture"
          @rotate="editor.rotate"
          @order="editor.orderFurniture"
        />
        <template v-else-if="room"
          ><div class="fp-inspector-heading">
            <h2>{{ state.rooms[room.id].name }}</h2>
            <p>{{ room.counted === false ? '飘窗区域 · 不计套内面积' : '房间属性' }}</p>
          </div>
          <label class="fp-field"
            >房间名称<input
              :value="state.rooms[room.id].name"
              maxlength="120"
              @change="roomNameChange"
          /></label>
          <div class="fp-stats">
            <div>
              <strong>{{ area(room.poly).toFixed(2) }}<small> m²</small></strong
              ><span>地面面积</span>
            </div>
            <div>
              <strong>{{ perim(room.poly).toFixed(2) }}<small> m</small></strong
              ><span>周长</span>
            </div>
            <div>
              <strong
                >{{ ((roomBounds[2] - roomBounds[0]) / 1000).toFixed(2) }} ×
                {{ ((roomBounds[3] - roomBounds[1]) / 1000).toFixed(2) }}</strong
              ><span>包围尺寸 (m)</span>
            </div>
            <div>
              <strong>{{ (perim(room.poly) * 2.8).toFixed(2) }}<small> m²</small></strong
              ><span>墙面估算</span>
            </div>
          </div>
          <p class="fp-muted">墙面按层高 2.8 m 估算，未扣门窗。</p>
          <fieldset>
            <legend>地面材料</legend>
            <select
              :value="state.rooms[room.id].mat"
              aria-label="地面材料"
              @change="materialChange"
            >
              <option v-for="(mat, id) in MATS" :key="id" :value="id">
                {{ mat.name }} · ¥{{ mat.price }}/m²
              </option>
            </select>
            <div
              class="fp-material-preview"
              :style="{ background: MATS[state.rooms[room.id].mat].sw }"
            ></div>
            <p class="fp-cost">
              约 ¥{{
                Math.round(
                  area(room.poly) * MATS[state.rooms[room.id].mat].price * 1.05,
                ).toLocaleString()
              }}
              <small>含 5% 损耗</small>
            </p>
          </fieldset>
          <h3>
            房间家具 <small>{{ roomFurniture.length }}</small>
          </h3>
          <div class="fp-contained-list">
            <button
              v-for="f in roomFurniture"
              :key="f.id"
              @click="select({ kind: 'furn', id: f.id })"
            >
              <span>{{ f.name }}</span
              ><small>{{ f.w }} × {{ f.d }}</small>
            </button>
            <p v-if="!roomFurniture.length" class="fp-muted">从底部家具库添加家具。</p>
          </div></template
        >
        <template v-else
          ><div class="fp-inspector-heading">
            <h2>全屋概览</h2>
            <p>布置你的理想居所</p>
          </div>
          <div class="fp-overview-area">
            <strong>{{ totalArea.toFixed(2) }}</strong
            ><span>m² 套内使用面积</span>
          </div>
          <div class="fp-stats">
            <div>
              <strong>{{ ROOMS.filter((r) => r.counted !== false).length }}</strong
              ><span>房间 / 区域</span>
            </div>
            <div>
              <strong>{{ state.furniture.length }}</strong
              ><span>家具</span>
            </div>
          </div>
          <fieldset>
            <legend>地面材料估算</legend>
            <p class="fp-overview-price">¥{{ Math.round(estimate).toLocaleString() }}</p>
            <p class="fp-muted">包含飘窗及 5% 材料损耗。按内置材料参考单价计算。</p>
          </fieldset>
          <div class="fp-room-summary">
            <button v-for="r in ROOMS" :key="r.id" @click="focusRoom(r.id)">
              <span
                >{{ state.rooms[r.id].name
                }}<small>{{ MATS[state.rooms[r.id].mat].name }}</small></span
              ><span>{{ area(r.poly).toFixed(2) }} m²</span>
            </button>
          </div>
          <p class="fp-muted">
            选择房间更换地面材料，选择家具调整参数。拆墙不改变房间面积划分。
          </p></template
        >
      </aside>
    </div>
    <FurnitureLibrary
      v-show="!walking"
      :collapsed="!panes.library"
      :disabled="busy || !ready"
      @toggle="panes.library = !panes.library"
      @add="addItem"
      @drop="dropItem"
      @hover="hoverItem"
    />
    <input
      ref="fileInput"
      type="file"
      accept=".json,.floorplan.json,application/json"
      hidden
      @change="fileChanged"
    />
    <div v-if="notification" class="fp-toast" role="status">{{ notification }}</div>
    <div
      v-if="dragGhost"
      class="fp-drag-ghost"
      :class="{ invalid: !dragGhost.valid }"
      :style="{
        left: `${dragGhost.x}px`,
        top: `${dragGhost.y}px`,
        width: `${Math.max(32, dragGhost.item[2] * dragGhost.scale)}px`,
        height: `${Math.max(24, dragGhost.item[3] * dragGhost.scale)}px`,
      }"
    >
      <svg
        :viewBox="`${-dragGhost.item[2] / 2} ${-dragGhost.item[3] / 2} ${dragGhost.item[2]} ${dragGhost.item[3]}`"
        v-html="ghostSvg(dragGhost.item)"
      />
    </div>
    <dialog
      ref="dialog"
      class="fp-dialog"
      @cancel="modal = null"
      @click="$event.target === dialog && closeModal()"
    >
      <template v-if="modal"
        ><h2>{{ modal.title }}</h2>
        <p>{{ modal.body }}</p>
        <div>
          <button @click="closeModal">取消</button
          ><button class="fp-primary" @click="confirmModal">{{ modal.confirm }}</button>
        </div></template
      >
    </dialog>
  </main>
</template>
