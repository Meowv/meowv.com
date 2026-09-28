<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useTheme } from '@/composables/useTheme';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import NoteCard from '@/features/notes/components/NoteCard.vue';
import NotesHeader from '@/features/notes/components/NotesHeader.vue';
import { mergeNotesBackup, parseNotesBackup, serializeNotesBackup } from './backup';
import {
  clearNoteStickies,
  createNoteSticky,
  deleteNoteSticky,
  listNoteStickies,
  saveNotesBatch,
} from '@/features/notes/storage';
import type { NoteLayoutMode, NoteSticky } from '@/features/notes/types';
import { NOTE_PIN_Z_BASE } from '@/features/notes/types';
import '@/features/notes/notes.css';

const HEADER_PREFERENCE_KEY = `${STORAGE_POLICY.namespace('notes')}:header-collapsed`;

const {
  resolved: resolvedTheme,
  toggle: toggleTheme,
  toggleWithoutPersist: toggleThemeLive,
} = useTheme();
interface CarnivalCard {
  setCarnivalTransform(x: number, y: number, rotation: number, scale?: number): void;
  clearCarnivalTransform(): void;
  playLayoutTransition(deltaX: number, deltaY: number): void;
}

interface NoteLayout {
  id: string;
  width: number;
  height: number;
  x: number;
  y: number;
  mode: NoteLayoutMode;
}

interface NoteLayoutSize {
  width: number;
  height: number;
}

interface NoteGridPlacement {
  column: number;
  span: number;
  y: number;
}

type CarnivalDanceType = 'wobble' | 'bounce' | 'circle' | 'spin';

interface CarnivalPhysics {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  rotationSpeed: number;
  bobPhase: number;
  nextImpulseAt: number;
  danceType: CarnivalDanceType;
  dancePhase: number;
  scale: number;
}

interface CarnivalProfile {
  initialSpeed: number;
  maxSpeed: number;
  impulse: number;
  maxRotation: number;
  maxRotationSpeed: number;
  bobForce: number;
  repulsion: number;
  repulsionRadius: number;
  danceStrength: number;
  attraction: number;
  trail: boolean;
}

interface CarnivalCenter {
  x: number;
  y: number;
  angle: number;
  radius: number;
  speed: number;
}

type ParticleKind = 'confetti' | 'star' | 'dot';

interface Particle {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
  rotation: number;
  rotationSpeed: number;
}

const CARNIVAL_DANCE_TYPES: CarnivalDanceType[] = ['wobble', 'bounce', 'circle', 'spin'];
const PARTICLE_COLORS = [
  '#f43f5e',
  '#f59e0b',
  '#22c55e',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#fbbf24',
];
const MAX_PARTICLES = 150;
const NOTE_LAYOUT_SIZES = {
  large: { width: 320, height: 240 },
  normal: { width: 260, height: 180 },
  small: { width: 220, height: 150 },
  compact: { width: 220, height: 48 },
} satisfies Record<string, NoteLayoutSize>;
const COMPACT_NOTE_LAYOUT = {
  padding: 16,
  gap: 10,
  stackLimit: 5,
  stackOffset: 8,
};

const CARNIVAL_PROFILES: CarnivalProfile[] = [
  {
    initialSpeed: 42,
    maxSpeed: 72,
    impulse: 18,
    maxRotation: 5,
    maxRotationSpeed: 16,
    bobForce: 38,
    repulsion: 0,
    repulsionRadius: 100,
    danceStrength: 0,
    attraction: 0,
    trail: false,
  },
  {
    initialSpeed: 68,
    maxSpeed: 112,
    impulse: 34,
    maxRotation: 9,
    maxRotationSpeed: 30,
    bobForce: 64,
    repulsion: 0,
    repulsionRadius: 100,
    danceStrength: 0,
    attraction: 0,
    trail: false,
  },
  {
    initialSpeed: 112,
    maxSpeed: 176,
    impulse: 56,
    maxRotation: 14,
    maxRotationSpeed: 52,
    bobForce: 98,
    repulsion: 0,
    repulsionRadius: 100,
    danceStrength: 0,
    attraction: 0,
    trail: false,
  },
  {
    initialSpeed: 164,
    maxSpeed: 240,
    impulse: 84,
    maxRotation: 20,
    maxRotationSpeed: 78,
    bobForce: 138,
    repulsion: 0,
    repulsionRadius: 100,
    danceStrength: 0,
    attraction: 0,
    trail: false,
  },
  {
    initialSpeed: 210,
    maxSpeed: 300,
    impulse: 110,
    maxRotation: 26,
    maxRotationSpeed: 96,
    bobForce: 165,
    repulsion: 620,
    repulsionRadius: 100,
    danceStrength: 0,
    attraction: 0,
    trail: false,
  },
  {
    initialSpeed: 240,
    maxSpeed: 330,
    impulse: 120,
    maxRotation: 32,
    maxRotationSpeed: 120,
    bobForce: 190,
    repulsion: 620,
    repulsionRadius: 110,
    danceStrength: 70,
    attraction: 0,
    trail: false,
  },
  {
    initialSpeed: 260,
    maxSpeed: 350,
    impulse: 130,
    maxRotation: 40,
    maxRotationSpeed: 140,
    bobForce: 60,
    repulsion: 620,
    repulsionRadius: 120,
    danceStrength: 90,
    attraction: 300,
    trail: false,
  },
  {
    initialSpeed: 280,
    maxSpeed: 380,
    impulse: 150,
    maxRotation: 48,
    maxRotationSpeed: 160,
    bobForce: 80,
    repulsion: 700,
    repulsionRadius: 130,
    danceStrength: 110,
    attraction: 320,
    trail: true,
  },
];

const notes = ref<NoteSticky[]>([]);
const headerVisible = ref(true);
const loading = ref(true);
const topZ = ref(0);
const canvasRef = ref<HTMLElement | null>(null);
const carnivalLevel = ref(0);
const isCarnival = ref(false);
const carnivalToast = ref(false);
const cardRefs = new Map<string, CarnivalCard>();
const carnivalPhysics = new Map<string, CarnivalPhysics>();
const carnivalTrails = new Map<string, { x: number; y: number; color: string }[]>();
const particles: Particle[] = [];
const fxCanvasRef = ref<HTMLCanvasElement | null>(null);
const backupInput = ref<HTMLInputElement | null>(null);
const backupNotice = ref('');
const backupNoticeError = ref(false);

let saveTimer: number | null = null;
let saveQueue = Promise.resolve();
let pendingSaves = new Set<string>();
let createdCount = 0;
let carnivalFrame: number | null = null;
let carnivalLastFrame = 0;
let carnivalCenter: CarnivalCenter | null = null;
let carnivalEventAt = 0;
let fxContext: CanvasRenderingContext2D | null = null;
let fxWidth = 0;
let fxHeight = 0;
let toastTimer: number | null = null;
let backupNoticeTimer: number | null = null;
let backupDownloadTimer: number | null = null;
let backupDownloadUrl: string | null = null;
let collapseCycleTimer: number | null = null;
let collapseCycleInfinite = false;
let carnivalAudioSource: AudioBufferSourceNode | null = null;
let audioContext: AudioContext | null = null;
let audioGain: GainNode | null = null;
let carnivalAudioBuffer: AudioBuffer | null = null;
let carnivalBeatInterval: number | null = null;
let autoLayoutFrame: number | null = null;
let canvasResizeObserver: ResizeObserver | null = null;
let observedCanvasWidth = 0;
let observedCanvasHeight = 0;
let ignoreNextHeaderResize = false;

const allCollapsed = computed(
  () => notes.value.length > 0 && notes.value.every((n) => n.collapsed),
);

function enqueueSave(operation: () => Promise<void>): Promise<void> {
  const queued = saveQueue.then(operation, operation);
  saveQueue = queued.catch(() => undefined);
  return queued;
}

function flushSaves(): void {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingSaves.size === 0) return;
  const batch = notes.value.filter((note) => pendingSaves.has(note.id));
  pendingSaves.clear();
  void enqueueSave(() => saveNotesBatch(batch)).catch((error: unknown) => {
    console.error('保存便签失败：', error);
  });
}

function scheduleSave(note: NoteSticky, delay = 700): void {
  pendingSaves.add(note.id);
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => flushSaves(), delay);
}

function patchNote(id: string, patch: Partial<NoteSticky>): void {
  const note = notes.value.find((item) => item.id === id);
  if (!note) return;
  if (patch.pinned !== undefined && patch.pinned !== note.pinned) {
    if (patch.pinned) {
      note.zIndex = maxPinnedZ() + 1;
    } else {
      topZ.value += 1;
      note.zIndex = topZ.value;
    }
  }
  const now = Date.now();
  const contentChanged = patch.content !== undefined && patch.content !== note.content;
  if (contentChanged) note.lastEditedAt = now;
  if (patch.collapsed !== undefined) note.layoutMode = undefined;
  Object.assign(note, patch, { updatedAt: now });
  if (contentChanged) scheduleSave(note);
}

function saveNote(id: string): void {
  const note = notes.value.find((item) => item.id === id);
  if (note) scheduleSave(note, 0);
}

function setCardRef(id: string, instance: unknown): void {
  const card = instance as Partial<CarnivalCard> | null;
  if (card?.setCarnivalTransform && card.clearCarnivalTransform && card.playLayoutTransition) {
    cardRefs.set(id, card as CarnivalCard);
    return;
  }
  cardRefs.delete(id);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomSigned(magnitude: number): number {
  return randomBetween(-magnitude, magnitude);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCarnivalProfile(): CarnivalProfile {
  return CARNIVAL_PROFILES[Math.min(carnivalLevel.value, CARNIVAL_PROFILES.length) - 1];
}

function limitVelocity(state: CarnivalPhysics, maximum: number): void {
  const speed = Math.hypot(state.velocityX, state.velocityY);
  if (speed <= maximum) return;
  const ratio = maximum / speed;
  state.velocityX *= ratio;
  state.velocityY *= ratio;
}

function createCarnivalPhysics(
  note: NoteSticky,
  profile: CarnivalProfile,
  now: number,
): CarnivalPhysics {
  const direction = randomBetween(0, Math.PI * 2);
  const speed = randomBetween(profile.initialSpeed * 0.55, profile.initialSpeed);
  const state: CarnivalPhysics = {
    x: note.x,
    y: note.y,
    velocityX: Math.cos(direction) * speed,
    velocityY: Math.sin(direction) * speed,
    rotation: randomSigned(profile.maxRotation / 2),
    rotationSpeed: randomSigned(profile.maxRotationSpeed),
    bobPhase: randomBetween(0, Math.PI * 2),
    nextImpulseAt: now + randomBetween(240, 720),
    danceType: CARNIVAL_DANCE_TYPES[Math.floor(Math.random() * CARNIVAL_DANCE_TYPES.length)],
    dancePhase: randomBetween(0, Math.PI * 2),
    scale: 1,
  };
  limitVelocity(state, profile.maxSpeed);
  return state;
}

function initializeCarnivalPhysics(): void {
  const now = performance.now();
  const profile = getCarnivalProfile();
  carnivalPhysics.clear();
  for (const note of notes.value) {
    carnivalPhysics.set(note.id, createCarnivalPhysics(note, profile, now));
  }
  carnivalLastFrame = now;
}

function clearCarnivalTransforms(): void {
  for (const card of cardRefs.values()) card.clearCarnivalTransform();
}

function pauseCarnival(): void {
  if (carnivalFrame !== null) window.cancelAnimationFrame(carnivalFrame);
  carnivalFrame = null;
}

function resumeCarnival(): void {
  if (!isCarnival.value || carnivalFrame !== null) return;
  carnivalLastFrame = performance.now();
  carnivalFrame = window.requestAnimationFrame(updateCarnival);
}

function rebaseCarnivalPhysics(): void {
  for (const note of notes.value) {
    const state = carnivalPhysics.get(note.id);
    if (!state) continue;
    state.x = note.x;
    state.y = note.y;
    cardRefs.get(note.id)?.setCarnivalTransform(0, 0, state.rotation);
  }
}

function updateCarnival(now: number): void {
  carnivalFrame = null;
  if (!isCarnival.value) return;
  const canvas = canvasRef.value;
  if (!canvas) {
    resumeCarnival();
    return;
  }
  const profile = getCarnivalProfile();
  const elapsed = Math.min((now - carnivalLastFrame) / 1000, 0.05);
  carnivalLastFrame = now;
  const canvasWidth = canvas.clientWidth;
  const canvasHeight = canvas.clientHeight;

  updateCarnivalCenter(profile, elapsed, canvasWidth, canvasHeight);
  maybeTriggerCarnivalEvent(profile, now, canvasWidth, canvasHeight);

  const states: CarnivalPhysics[] = [];
  for (const note of notes.value) {
    const state = carnivalPhysics.get(note.id);
    if (!state) continue;
    states.push(state);

    if (now >= state.nextImpulseAt) {
      state.velocityX += randomSigned(profile.impulse);
      state.velocityY += randomSigned(profile.impulse);
      state.rotationSpeed = clamp(
        state.rotationSpeed + randomSigned(profile.maxRotationSpeed * 0.45),
        -profile.maxRotationSpeed,
        profile.maxRotationSpeed,
      );
      state.nextImpulseAt = now + randomBetween(220, 680);
    }

    state.velocityY += Math.sin(now * 0.007 + state.bobPhase) * profile.bobForce * elapsed;
    if (profile.attraction > 0 && carnivalCenter) {
      applyAttraction(state, carnivalCenter, profile.attraction, elapsed);
    }
    limitVelocity(state, profile.maxSpeed);
    state.x += state.velocityX * elapsed;
    state.y += state.velocityY * elapsed;

    const noteHeight = note.collapsed ? 34 : note.height;
    const maxX = Math.max(0, canvasWidth - note.width);
    const maxY = Math.max(0, canvasHeight - noteHeight);
    if (state.x <= 0 || state.x >= maxX) {
      state.x = clamp(state.x, 0, maxX);
      state.velocityX = Math.abs(state.velocityX) * (state.x === 0 ? 1 : -1);
      state.rotationSpeed *= -0.9;
    }
    if (state.y <= 0 || state.y >= maxY) {
      state.y = clamp(state.y, 0, maxY);
      state.velocityY = Math.abs(state.velocityY) * (state.y === 0 ? 1 : -1);
      state.rotationSpeed *= -0.9;
    }

    state.rotation += state.rotationSpeed * elapsed;
    if (Math.abs(state.rotation) > profile.maxRotation) {
      state.rotation = Math.sign(state.rotation) * profile.maxRotation;
      state.rotationSpeed *= -0.92;
    }
  }

  if (profile.repulsion > 0) applyRepulsion(states, profile, elapsed);

  for (const note of notes.value) {
    const state = carnivalPhysics.get(note.id);
    if (!state) continue;
    const dance = danceOffset(state, profile, now);
    const scale =
      profile.danceStrength > 0 ? 1 + Math.sin(now * 0.005 + state.dancePhase) * 0.05 : 1;
    state.scale = scale;
    if (profile.trail) {
      const points = carnivalTrails.get(note.id) ?? [];
      points.push({ x: state.x + dance.x, y: state.y + dance.y, color: note.color });
      if (points.length > 12) points.shift();
      carnivalTrails.set(note.id, points);
    } else {
      carnivalTrails.delete(note.id);
    }
    cardRefs
      .get(note.id)
      ?.setCarnivalTransform(
        state.x - note.x + dance.x,
        state.y - note.y + dance.y,
        state.rotation + dance.rotation,
        scale,
      );
  }

  updateAndDrawFx(now, elapsed, profile);
  resumeCarnival();
}

function danceOffset(
  state: CarnivalPhysics,
  profile: CarnivalProfile,
  now: number,
): { x: number; y: number; rotation: number } {
  if (profile.danceStrength <= 0) return { x: 0, y: 0, rotation: 0 };
  const strength = profile.danceStrength;
  const phase = state.dancePhase;
  const time = now * 0.001;
  switch (state.danceType) {
    case 'wobble':
      return {
        x: Math.sin(time * 4.6 + phase) * strength,
        y: 0,
        rotation: Math.sin(time * 3.1 + phase) * strength * 0.35,
      };
    case 'bounce':
      return {
        x: 0,
        y: Math.abs(Math.sin(time * 5.4 + phase)) * strength * 1.25,
        rotation: 0,
      };
    case 'circle': {
      const radius = strength * 1.15;
      const angle = time * 2.8 + phase;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, rotation: 0 };
    }
    case 'spin':
      return { x: 0, y: 0, rotation: time * 34 * (strength / 100) };
  }
}

function applyRepulsion(
  states: CarnivalPhysics[],
  profile: CarnivalProfile,
  elapsed: number,
): void {
  const radius = profile.repulsionRadius;
  const radiusSquared = radius * radius;
  for (let i = 0; i < states.length; i++) {
    const a = states[i];
    for (let j = i + 1; j < states.length; j++) {
      const b = states[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= radiusSquared || distanceSquared === 0) continue;
      const distance = Math.sqrt(distanceSquared);
      const force = profile.repulsion * (1 - distance / radius) * elapsed;
      const nx = dx / distance;
      const ny = dy / distance;
      a.velocityX += nx * force;
      a.velocityY += ny * force;
      b.velocityX -= nx * force;
      b.velocityY -= ny * force;
    }
  }
}

function applyAttraction(
  state: CarnivalPhysics,
  center: CarnivalCenter,
  strength: number,
  elapsed: number,
): void {
  const dx = center.x - state.x;
  const dy = center.y - state.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  state.velocityX += (dx / distance) * strength * elapsed;
  state.velocityY += (dy / distance) * strength * elapsed;
  state.velocityX += (-dy / distance) * strength * 0.35 * elapsed;
  state.velocityY += (dx / distance) * strength * 0.35 * elapsed;
}

function updateCarnivalCenter(
  profile: CarnivalProfile,
  elapsed: number,
  width: number,
  height: number,
): void {
  if (profile.attraction <= 0) {
    carnivalCenter = null;
    return;
  }
  if (!carnivalCenter) {
    const base = Math.min(width, height);
    carnivalCenter = {
      x: width / 2,
      y: height / 2,
      angle: randomBetween(0, Math.PI * 2),
      radius: randomBetween(base * 0.16, base * 0.34),
      speed: randomBetween(0.5, 0.9),
    };
  }
  carnivalCenter.angle += carnivalCenter.speed * elapsed;
  carnivalCenter.x = width / 2 + Math.cos(carnivalCenter.angle) * carnivalCenter.radius;
  carnivalCenter.y = height / 2 + Math.sin(carnivalCenter.angle) * carnivalCenter.radius;
}

function maybeTriggerCarnivalEvent(
  profile: CarnivalProfile,
  now: number,
  width: number,
  height: number,
): void {
  if (profile.attraction <= 0 || carnivalPhysics.size === 0) return;
  if (now < carnivalEventAt) return;
  carnivalEventAt = now + randomBetween(3000, 5000);
  const kind = Math.floor(Math.random() * 3);
  if (kind === 0) {
    const cx = width / 2;
    const cy = height / 2;
    for (const state of carnivalPhysics.values()) {
      const dx = cx - state.x;
      const dy = cy - state.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      state.velocityX += (dx / distance) * 460;
      state.velocityY += (dy / distance) * 460;
    }
    spawnParticles(18);
  } else if (kind === 1) {
    const targets = [...carnivalPhysics.values()];
    const target = targets[Math.floor(Math.random() * targets.length)];
    target.velocityX = randomSigned(560);
    target.velocityY = randomSigned(560);
    spawnParticles(26, target.x, target.y);
  } else {
    for (const state of carnivalPhysics.values()) {
      state.velocityX *= 0.42;
      state.velocityY *= 0.42;
      state.rotationSpeed *= 0.8;
    }
    spawnParticles(10);
  }
}

function ensureFxCanvas(): void {
  const canvas = fxCanvasRef.value;
  const workspace = canvasRef.value;
  if (!canvas || !workspace) return;
  const width = workspace.clientWidth;
  const height = workspace.clientHeight;
  if (width === 0 || height === 0 || (canvas.width > 0 && fxWidth === width)) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  fxContext = canvas.getContext('2d');
  fxContext?.setTransform(ratio, 0, 0, ratio, 0, 0);
  fxWidth = width;
  fxHeight = height;
}

function spawnParticles(count: number, x?: number, y?: number): void {
  const originX = x ?? randomBetween(0, fxWidth || 1);
  const originY = y ?? randomBetween(0, (fxHeight || 1) * 0.6);
  for (let index = 0; index < count && particles.length < MAX_PARTICLES; index++) {
    const roll = Math.random();
    const kind: ParticleKind = roll < 0.5 ? 'confetti' : roll < 0.78 ? 'dot' : 'star';
    particles.push({
      x: originX,
      y: originY,
      velocityX: randomSigned(randomBetween(60, 260)),
      velocityY: randomBetween(-320, -40),
      life: 0,
      maxLife: randomBetween(0.7, 1.3),
      size:
        kind === 'confetti'
          ? randomBetween(4, 8)
          : kind === 'star'
            ? randomBetween(10, 16)
            : randomBetween(2, 4),
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      kind,
      rotation: randomBetween(0, Math.PI * 2),
      rotationSpeed: randomSigned(7),
    });
  }
}

function updateAndDrawFx(now: number, elapsed: number, profile: CarnivalProfile): void {
  ensureFxCanvas();
  const context = fxContext;
  if (!context) return;
  context.clearRect(0, 0, fxWidth, fxHeight);

  if (profile.trail) {
    for (const points of carnivalTrails.values()) {
      const count = points.length;
      for (let index = 0; index < count; index++) {
        const point = points[index];
        context.globalAlpha = ((index + 1) / count) * 0.45;
        context.beginPath();
        context.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
        context.fillStyle = point.color;
        context.fill();
      }
    }
  }

  if (profile.danceStrength > 0 && particles.length < MAX_PARTICLES && Math.random() < 0.35) {
    spawnParticles(1);
  }

  for (let index = particles.length - 1; index >= 0; index--) {
    const particle = particles[index];
    particle.life += elapsed;
    if (particle.life >= particle.maxLife) {
      particles.splice(index, 1);
      continue;
    }
    particle.velocityY += 36 * elapsed;
    particle.x += particle.velocityX * elapsed;
    particle.y += particle.velocityY * elapsed;
    particle.rotation += particle.rotationSpeed * elapsed;
    const alpha = 1 - particle.life / particle.maxLife;
    context.globalAlpha = alpha;
    context.fillStyle = particle.color;
    if (particle.kind === 'confetti') {
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.6);
      context.restore();
    } else if (particle.kind === 'star') {
      context.font = `${particle.size}px serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('✦', particle.x, particle.y);
    } else {
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;
}

function showCarnivalToast(): void {
  carnivalToast.value = true;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    carnivalToast.value = false;
  }, 3600);
}

function boostCarnival(): void {
  const profile = getCarnivalProfile();
  const now = performance.now();
  for (const state of carnivalPhysics.values()) {
    state.velocityX += randomSigned(profile.impulse);
    state.velocityY += randomSigned(profile.impulse);
    state.rotationSpeed = clamp(
      state.rotationSpeed + randomSigned(profile.maxRotationSpeed * 0.5),
      -profile.maxRotationSpeed,
      profile.maxRotationSpeed,
    );
    state.nextImpulseAt = now + randomBetween(120, 360);
    limitVelocity(state, profile.maxSpeed);
  }
}

async function startCarnival(): Promise<void> {
  carnivalLevel.value += 1;
  const isFirstEntry = !isCarnival.value;
  if (isFirstEntry) {
    arrangeCanvas(false);
    await nextTick();
    isCarnival.value = true;
    initializeCarnivalPhysics();
    ensureFxCanvas();
    spawnParticles(90);
    resumeCarnival();
    return;
  }
  boostCarnival();
  if (carnivalLevel.value === 5) {
    runCollapseCycle();
  }
  if (carnivalLevel.value === 7) {
    carnivalCenter = null;
    carnivalEventAt = performance.now() + randomBetween(3000, 5000);
  }
  if (carnivalLevel.value === 8) {
    showCarnivalToast();
    spawnParticles(140);
    runCollapseCycle(true);
    startCarnivalAudio();
  }
}

function maxPinnedZ(): number {
  return notes.value.reduce(
    (max, note) => (note.pinned ? Math.max(max, note.zIndex) : max),
    NOTE_PIN_Z_BASE,
  );
}

function bringToFront(id: string): void {
  const note = notes.value.find((item) => item.id === id);
  if (!note) return;
  if (note.pinned) {
    note.zIndex = maxPinnedZ() + 1;
  } else {
    topZ.value += 1;
    note.zIndex = topZ.value;
  }
  scheduleSave(note, 0);
}

function createNote(): void {
  const canvas = canvasRef.value;
  const baseX = canvas ? Math.max(16, (canvas.clientWidth - 300) / 2) : 80;
  const baseY = canvas ? Math.max(16, (canvas.clientHeight - 220) / 2) : 80;
  const offset = (createdCount % 6) * 28;
  const note = createNoteSticky('', baseX + offset, baseY + offset, topZ.value + 1);
  topZ.value = note.zIndex;
  notes.value.push(note);
  createdCount += 1;
  scheduleSave(note, 0);
  scheduleCanvasLayout();
  if (isCarnival.value) {
    const profile = getCarnivalProfile();
    const now = performance.now();
    carnivalPhysics.set(note.id, createCarnivalPhysics(note, profile, now));
  }
}

function showBackupNotice(message: string, error = false): void {
  backupNotice.value = message;
  backupNoticeError.value = error;
  if (backupNoticeTimer !== null) window.clearTimeout(backupNoticeTimer);
  backupNoticeTimer = window.setTimeout(() => {
    backupNotice.value = '';
    backupNoticeTimer = null;
  }, 5000);
}

async function exportBackup(): Promise<void> {
  try {
    flushSaves();
    await saveQueue;
    const blob = new Blob([serializeNotesBackup(notes.value)], { type: 'application/json' });
    if (backupDownloadTimer !== null) window.clearTimeout(backupDownloadTimer);
    if (backupDownloadUrl) URL.revokeObjectURL(backupDownloadUrl);
    backupDownloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = backupDownloadUrl;
    link.download = `meowv-notes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    backupDownloadTimer = window.setTimeout(() => {
      if (backupDownloadUrl) URL.revokeObjectURL(backupDownloadUrl);
      backupDownloadUrl = null;
      backupDownloadTimer = null;
    }, 1000);
    showBackupNotice(`已导出 ${notes.value.length} 张便签。`);
  } catch (error) {
    showBackupNotice(error instanceof Error ? error.message : '导出备份失败。', true);
  }
}

function chooseBackup(): void {
  if (!backupInput.value) return;
  backupInput.value.value = '';
  backupInput.value.click();
}

async function importBackup(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showBackupNotice('备份文件超过 20 MB，无法导入。', true);
    return;
  }
  try {
    const imported = parseNotesBackup(await file.text());
    flushSaves();
    await saveQueue;
    const added = mergeNotesBackup(notes.value, imported, () => createNoteSticky('', 0, 0, 0).id);
    if (added.length === 0) {
      showBackupNotice('备份中的便签已存在，无需重复导入。');
      return;
    }
    await enqueueSave(() => saveNotesBatch(added));
    notes.value.push(...added);
    topZ.value = Math.max(
      topZ.value,
      ...added.filter((note) => !note.pinned).map((note) => note.zIndex),
    );
    showBackupNotice(`已导入 ${added.length} 张便签，原有便签已保留。`);
  } catch (error) {
    showBackupNotice(error instanceof Error ? error.message : '导入备份失败。', true);
  }
}

async function deleteNote(id: string): Promise<void> {
  const note = notes.value.find((item) => item.id === id);
  if (!note) return;
  if (
    !window.confirm(`删除便签“${note.content.split('\n')[0] || '空白便签'}”？本地便签将无法恢复。`)
  ) {
    return;
  }
  notes.value = notes.value.filter((item) => item.id !== id);
  pendingSaves.delete(id);
  carnivalPhysics.delete(id);
  carnivalTrails.delete(id);
  scheduleCanvasLayout();
  if (isCarnival.value && getCarnivalProfile().danceStrength > 0) {
    spawnParticles(16, note.x + note.width / 2, note.y + note.height / 2);
  }
  try {
    await enqueueSave(() => deleteNoteSticky(id));
  } catch (error) {
    console.error('删除便签失败：', error);
  }
}

async function clearAll(): Promise<void> {
  if (notes.value.length === 0) return;
  if (!window.confirm('确定删除全部本地便签吗？此操作无法撤销。')) return;
  pendingSaves.clear();
  notes.value = [];
  topZ.value = 0;
  createdCount = 0;
  carnivalPhysics.clear();
  carnivalTrails.clear();
  particles.length = 0;
  fxContext?.clearRect(0, 0, fxWidth, fxHeight);
  stopCollapseCycle();
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  await enqueueSave(() => clearNoteStickies()).catch((error: unknown) => {
    console.error('清空便签失败：', error);
  });
}

function applyCollapse(nextCollapsed: boolean, persist: boolean): void {
  for (const note of notes.value) {
    note.collapsed = nextCollapsed;
    if (persist) note.layoutMode = undefined;
    if (persist) pendingSaves.add(note.id);
  }
  if (persist) flushSaves();
}

function toggleAll(): void {
  if (notes.value.length === 0) return;
  applyCollapse(!allCollapsed.value, true);
}

const COLLAPSE_CYCLE_COUNT = 8;
const COLLAPSE_CYCLE_INTERVAL = 260;

function stopCollapseCycle(): void {
  collapseCycleInfinite = false;
  if (collapseCycleTimer !== null) {
    window.clearTimeout(collapseCycleTimer);
    collapseCycleTimer = null;
  }
}

function runCollapseCycle(infinite = false): void {
  stopCollapseCycle();
  collapseCycleInfinite = infinite;
  let remaining = infinite ? 0 : COLLAPSE_CYCLE_COUNT;
  const step = (): void => {
    const done = !collapseCycleInfinite && remaining <= 0;
    if (!isCarnival.value || done) {
      collapseCycleTimer = null;
      return;
    }
    if (notes.value.length > 0) {
      applyCollapse(!allCollapsed.value, !collapseCycleInfinite);
      remaining -= 1;
    }
    if (collapseCycleInfinite) toggleThemeLive();
    collapseCycleTimer = window.setTimeout(step, carnivalBeatInterval ?? COLLAPSE_CYCLE_INTERVAL);
  };
  step();
}

function findCarnivalMusicEnd(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const frameSize = Math.max(1, Math.floor(sampleRate * 0.02));
  const threshold = 0.005;
  const silenceWindow = Math.floor(sampleRate * 0.2);
  let silent = 0;
  let candidate = data.length;
  for (let index = data.length - frameSize; index >= 0; index -= frameSize) {
    let peak = 0;
    for (let sample = index; sample < index + frameSize && sample < data.length; sample++) {
      const value = Math.abs(data[sample]);
      if (value > peak) peak = value;
    }
    if (peak < threshold) {
      if (silent === 0) candidate = index;
      silent += frameSize;
      if (silent >= silenceWindow) return candidate / sampleRate;
    } else {
      silent = 0;
    }
  }
  return data.length / sampleRate;
}

function scrubCarnivalTail(buffer: AudioBuffer): void {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  const frameSize = Math.max(1, Math.floor(sampleRate * 0.01));
  const blockRms = new Float32Array(Math.ceil(length / frameSize));
  let maxBlock = 0;
  for (let start = 0; start < length; start += frameSize) {
    const end = Math.min(start + frameSize, length);
    let sum = 0;
    for (let channel = 0; channel < channelCount; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = start; index < end; index++) {
        const value = data[index];
        sum += value * value;
      }
    }
    const rms = Math.sqrt(sum / ((end - start) * channelCount));
    blockRms[Math.floor(start / frameSize)] = rms;
    if (rms > maxBlock) maxBlock = rms;
  }
  if (maxBlock <= 0.4) return;
  const lastBlock = blockRms.length - 1;
  if (blockRms[lastBlock] <= 0.4) return;
  const previous = blockRms[lastBlock - 1] ?? 0;
  if (previous >= blockRms[lastBlock] * 0.4) return;
  let clearedFrom = lastBlock * frameSize;
  for (let block = lastBlock; block > 0 && blockRms[block] > 0.4; block--) {
    clearedFrom = block * frameSize;
  }
  if (lastBlock * frameSize - clearedFrom > sampleRate * 0.1) return;
  for (let channel = 0; channel < channelCount; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = clearedFrom; index < length; index++) data[index] = 0;
  }
}

function detectCarnivalTempo(buffer: AudioBuffer): number | null {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const frameSize = Math.max(1, Math.floor(sampleRate * 0.01));
  const frameCount = Math.floor(data.length / frameSize);
  if (frameCount < 64) return null;
  const frames: number[] = [];
  let maxFrame = 0;
  for (let index = 0; index < frameCount; index++) {
    const start = index * frameSize;
    const end = Math.min(start + frameSize, data.length);
    let sum = 0;
    for (let sample = start; sample < end; sample++) {
      const value = data[sample];
      sum += value * value;
    }
    const rms = Math.sqrt(sum / (end - start));
    frames.push(rms);
    if (rms > maxFrame) maxFrame = rms;
  }
  if (maxFrame === 0) return null;
  const onsets: number[] = [];
  const threshold = maxFrame * 0.35;
  const neighbor = Math.max(3, Math.round(0.25 / 0.01));
  for (let index = 1; index < frameCount - 1; index++) {
    if (frames[index] < threshold) continue;
    let localPeak = true;
    for (
      let offset = Math.max(0, index - neighbor);
      offset <= Math.min(frameCount - 1, index + neighbor);
      offset++
    ) {
      if (frames[offset] > frames[index]) {
        localPeak = false;
        break;
      }
    }
    if (localPeak) onsets.push(index * 0.01);
  }
  if (onsets.length < 4) return null;
  const candidates: { bpm: number; score: number }[] = [];
  for (let index = 1; index < onsets.length; index++) {
    const interval = onsets[index] - onsets[index - 1];
    if (interval < 0.25 || interval > 2) continue;
    const bpm = 60 / interval;
    let score = 0;
    for (let other = 1; other < onsets.length; other++) {
      const otherInterval = onsets[other] - onsets[other - 1];
      if (otherInterval < 0.2 || otherInterval > 2) continue;
      const ratio = otherInterval / interval;
      const rounded = Math.round(ratio);
      if (rounded >= 1 && rounded <= 4 && Math.abs(ratio - rounded) < 0.12) score += 1;
    }
    candidates.push({ bpm, score });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  if (candidates[0].score < 3) return null;
  return Math.min(200, Math.max(60, Math.round(candidates[0].bpm)));
}

async function startCarnivalAudio(): Promise<void> {
  if (carnivalAudioSource) return;
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
      audioGain = audioContext.createGain();
      audioGain.gain.value = 0.5;
      audioGain.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') await audioContext.resume();
    if (!carnivalAudioBuffer) {
      const response = await fetch('/sounds/carnival.wav');
      const arrayBuffer = await response.arrayBuffer();
      carnivalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      scrubCarnivalTail(carnivalAudioBuffer);
      const bpm = detectCarnivalTempo(carnivalAudioBuffer);
      carnivalBeatInterval = bpm ? 60000 / bpm : null;
    }
    const source = audioContext.createBufferSource();
    source.buffer = carnivalAudioBuffer;
    source.loop = true;
    const musicEnd = findCarnivalMusicEnd(carnivalAudioBuffer);
    if (musicEnd > 0.05 && musicEnd < carnivalAudioBuffer.duration) {
      source.loopEnd = musicEnd;
    }
    source.connect(audioGain ?? audioContext.destination);
    source.start();
    carnivalAudioSource = source;
  } catch (error) {
    console.error('播放狂欢音效失败：', error);
  }
}

function stopCarnivalAudio(): void {
  if (!carnivalAudioSource) return;
  carnivalAudioSource.stop();
  carnivalAudioSource = null;
}

function disposeCarnivalAudio(): void {
  stopCarnivalAudio();
  carnivalAudioBuffer = null;
  carnivalBeatInterval = null;
  audioGain = null;
  void audioContext?.close().catch(() => undefined);
  audioContext = null;
}

function collapseOthers(id: string): void {
  if (notes.value.length < 2) return;
  for (const note of notes.value) {
    note.collapsed = note.id !== id;
    note.layoutMode = undefined;
    pendingSaves.add(note.id);
  }
  flushSaves();
}

function compareNotePriority(a: NoteSticky, b: NoteSticky): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const aActivityAt = Math.max(a.lastEditedAt, a.updatedAt, a.createdAt);
  const bActivityAt = Math.max(b.lastEditedAt, b.updatedAt, b.createdAt);
  if (aActivityAt !== bActivityAt) return bActivityAt - aActivityAt;
  return b.createdAt - a.createdAt;
}

function getPreferredLayoutSizes(note: NoteSticky): NoteLayoutSize[] {
  if (note.collapsed && note.layoutMode === undefined) {
    return [{ width: note.width, height: NOTE_LAYOUT_SIZES.compact.height }];
  }
  if (note.pinned) return [{ width: note.width, height: note.height }];
  return [NOTE_LAYOUT_SIZES.normal, NOTE_LAYOUT_SIZES.small];
}

function applyNoteLayout(
  note: NoteSticky,
  layout: NoteLayout,
  preserveManualCollapse = false,
): void {
  note.x = layout.x;
  note.y = layout.y;
  note.width = layout.width;
  note.height = layout.height;
  note.collapsed = layout.mode !== 'full';
  note.layoutMode = preserveManualCollapse ? undefined : layout.mode;
  pendingSaves.add(note.id);
}

function getGridColumnSpan(
  width: number,
  columnWidth: number,
  columnCount: number,
  gap: number,
): number {
  return Math.min(columnCount, Math.max(1, Math.ceil((width + gap) / (columnWidth + gap))));
}

function findGridPlacement(columnHeights: number[], span: number): NoteGridPlacement {
  let placement: NoteGridPlacement = { column: 0, span, y: Number.POSITIVE_INFINITY };
  for (let column = 0; column <= columnHeights.length - span; column += 1) {
    const y = Math.max(...columnHeights.slice(column, column + span));
    if (y < placement.y) placement = { column, span, y };
  }
  return placement;
}

function fillGridColumns(
  columnHeights: number[],
  placement: NoteGridPlacement,
  height: number,
  gap: number,
): void {
  const nextHeight = placement.y + height + gap;
  for (let column = placement.column; column < placement.column + placement.span; column += 1) {
    columnHeights[column] = nextHeight;
  }
}

function scheduleCanvasLayout(): void {
  if (autoLayoutFrame !== null) return;
  autoLayoutFrame = window.requestAnimationFrame(() => {
    autoLayoutFrame = null;
    arrangeCanvas();
  });
}

function observeCanvasResize(): void {
  const canvas = canvasRef.value;
  if (!canvas || typeof ResizeObserver === 'undefined') return;
  canvasResizeObserver?.disconnect();
  let initialized = false;
  canvasResizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (!initialized) {
      initialized = true;
      observedCanvasWidth = width;
      observedCanvasHeight = height;
      return;
    }
    if (width === observedCanvasWidth && height === observedCanvasHeight) return;
    observedCanvasWidth = width;
    observedCanvasHeight = height;
    if (ignoreNextHeaderResize) {
      ignoreNextHeaderResize = false;
      return;
    }
    scheduleCanvasLayout();
  });
  canvasResizeObserver.observe(canvas);
}

function arrangeCanvas(animate = true): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const viewportWidth = canvas.clientWidth;
  const viewportHeight = canvas.clientHeight;
  const sorted = [...notes.value].sort(compareNotePriority);
  if (sorted.length === 0) return;

  const { gap, padding, stackLimit, stackOffset } = COMPACT_NOTE_LAYOUT;
  const availableWidth = Math.max(0, viewportWidth - padding * 2);
  const columnCount = Math.max(
    1,
    Math.floor((availableWidth + gap) / (NOTE_LAYOUT_SIZES.normal.width + gap)),
  );
  const columnWidth = Math.max(1, (availableWidth - gap * (columnCount - 1)) / columnCount);
  const viewportBottom = Math.max(padding, viewportHeight - padding);
  const columnHeights = Array.from({ length: columnCount }, () => padding);
  const previousPositions = new Map(sorted.map((note) => [note.id, { x: note.x, y: note.y }]));
  let stacked = 0;

  for (const note of sorted) {
    const manuallyCollapsed = note.collapsed && note.layoutMode === undefined;
    const preferred = getPreferredLayoutSizes(note)
      .map((size) => {
        const placement = findGridPlacement(
          columnHeights,
          getGridColumnSpan(size.width, columnWidth, columnCount, gap),
        );
        return { size, placement };
      })
      .find(({ size, placement }) => placement.y + size.height <= viewportBottom);

    if (preferred) {
      const { size, placement } = preferred;
      const width =
        manuallyCollapsed || note.pinned ? note.width : Math.min(size.width, columnWidth);
      const occupiedWidth = placement.span * columnWidth + (placement.span - 1) * gap;
      applyNoteLayout(
        note,
        {
          id: note.id,
          width,
          height: manuallyCollapsed ? note.height : size.height,
          x: padding + placement.column * (columnWidth + gap) + (occupiedWidth - width) / 2,
          y: placement.y,
          mode: manuallyCollapsed ? 'compact' : 'full',
        },
        manuallyCollapsed,
      );
      fillGridColumns(columnHeights, placement, size.height, gap);
      continue;
    }

    const compactWidth = Math.min(NOTE_LAYOUT_SIZES.compact.width, columnWidth);
    const compactPlacement = findGridPlacement(
      columnHeights,
      getGridColumnSpan(compactWidth, columnWidth, columnCount, gap),
    );
    if (!note.pinned && compactPlacement.y + NOTE_LAYOUT_SIZES.compact.height <= viewportBottom) {
      const occupiedWidth = compactPlacement.span * columnWidth + (compactPlacement.span - 1) * gap;
      applyNoteLayout(note, {
        id: note.id,
        width: compactWidth,
        height: NOTE_LAYOUT_SIZES.compact.height,
        x:
          padding +
          compactPlacement.column * (columnWidth + gap) +
          (occupiedWidth - compactWidth) / 2,
        y: compactPlacement.y,
        mode: 'compact',
      });
      fillGridColumns(columnHeights, compactPlacement, NOTE_LAYOUT_SIZES.compact.height, gap);
      continue;
    }

    const stackIndex = Math.min(stacked, stackLimit - 1);
    const stackWidth = manuallyCollapsed || note.pinned ? note.width : compactWidth;
    const stackHeight =
      manuallyCollapsed || note.pinned ? note.height : NOTE_LAYOUT_SIZES.compact.height;
    const stackDisplayHeight = manuallyCollapsed ? NOTE_LAYOUT_SIZES.compact.height : stackHeight;
    applyNoteLayout(
      note,
      {
        id: note.id,
        width: stackWidth,
        height: stackHeight,
        x: Math.max(padding, viewportWidth - padding - stackWidth - stackIndex * stackOffset),
        y: Math.max(
          padding,
          viewportHeight - padding - stackDisplayHeight - stackIndex * stackOffset,
        ),
        mode: manuallyCollapsed ? 'compact' : note.pinned ? 'full' : 'stack',
      },
      manuallyCollapsed,
    );
    stacked += 1;
  }
  if (pendingSaves.size > 0) flushSaves();
  if (isCarnival.value) rebaseCarnivalPhysics();
  else if (animate) {
    void nextTick(() => {
      for (const note of sorted) {
        const previous = previousPositions.get(note.id);
        if (!previous) continue;
        cardRefs.get(note.id)?.playLayoutTransition(previous.x - note.x, previous.y - note.y);
      }
    });
  }
}

function toggleHeader(): void {
  ignoreNextHeaderResize = true;
  headerVisible.value = !headerVisible.value;
  if (!storageAvailable()) return;
  try {
    if (headerVisible.value) localStorage.removeItem(HEADER_PREFERENCE_KEY);
    else localStorage.setItem(HEADER_PREFERENCE_KEY, 'true');
  } catch {
    // 本地偏好不可用时保留当前页面状态。
  }
}

function normalizeLayerOrder(): void {
  const unpinned = [...notes.value]
    .filter((note) => !note.pinned)
    .sort((a, b) => a.zIndex - b.zIndex);
  const pinned = [...notes.value].filter((note) => note.pinned).sort((a, b) => a.zIndex - b.zIndex);
  topZ.value = 0;
  for (const note of unpinned) {
    topZ.value += 1;
    note.zIndex = topZ.value;
  }
  let pinBase = NOTE_PIN_Z_BASE;
  for (const note of pinned) {
    pinBase += 1;
    note.zIndex = pinBase;
  }
}

async function initialize(): Promise<void> {
  if (storageAvailable()) {
    try {
      headerVisible.value = localStorage.getItem(HEADER_PREFERENCE_KEY) !== 'true';
    } catch {
      // 本地偏好不可用时默认显示顶部栏。
    }
  }
  try {
    notes.value = await listNoteStickies();
    normalizeLayerOrder();
  } catch (error) {
    console.error('读取便签失败：', error);
  }
  if (notes.value.length === 0) createNote();
  loading.value = false;
  await nextTick();
  observeCanvasResize();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    flushSaves();
    pauseCarnival();
    stopCollapseCycle();
    stopCarnivalAudio();
    return;
  }
  resumeCarnival();
  if (carnivalLevel.value >= 8) {
    runCollapseCycle(true);
    startCarnivalAudio();
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (pendingSaves.size === 0) return;
  flushSaves();
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  void initialize();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
  flushSaves();
  if (autoLayoutFrame !== null) window.cancelAnimationFrame(autoLayoutFrame);
  canvasResizeObserver?.disconnect();
  pauseCarnival();
  clearCarnivalTransforms();
  carnivalPhysics.clear();
  carnivalTrails.clear();
  particles.length = 0;
  carnivalCenter = null;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  if (backupNoticeTimer !== null) window.clearTimeout(backupNoticeTimer);
  if (backupDownloadTimer !== null) window.clearTimeout(backupDownloadTimer);
  if (backupDownloadUrl) URL.revokeObjectURL(backupDownloadUrl);
  stopCollapseCycle();
  disposeCarnivalAudio();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);
});
</script>

<template>
  <section
    class="notes-editor"
    :class="{ 'notes-editor--carnival': isCarnival }"
    aria-label="便签画布"
  >
    <input
      ref="backupInput"
      class="visually-hidden"
      type="file"
      accept=".json,application/json"
      aria-label="选择便签备份文件"
      @change="importBackup"
    />
    <NotesHeader
      :header-visible="headerVisible"
      :all-collapsed="allCollapsed"
      :carnival-level="carnivalLevel"
      :resolved-theme="resolvedTheme"
      @toggle-header="toggleHeader"
      @create="createNote"
      @toggle-all="toggleAll"
      @arrange="arrangeCanvas"
      @carnival="startCarnival"
      @export-backup="exportBackup"
      @import-backup="chooseBackup"
      @clear="clearAll"
      @toggle-theme="toggleTheme"
    />

    <main ref="canvasRef" class="notes-editor__workspace">
      <div class="notes-editor__surface" aria-hidden="true"></div>
      <canvas ref="fxCanvasRef" class="notes-editor__fx" aria-hidden="true"></canvas>
      <template v-if="!loading">
        <NoteCard
          v-for="note in notes"
          :key="note.id"
          :ref="(instance) => setCardRef(note.id, instance)"
          :note="note"
          @update="patchNote"
          @save="saveNote"
          @delete="deleteNote"
          @front="bringToFront"
          @shake="collapseOthers"
        />
        <div v-if="notes.length === 0" class="notes-editor__empty" role="status">
          <strong>还没有便签</strong>
          <p>点击顶栏的新建按钮，创建第一张便签。</p>
        </div>
      </template>
    </main>
    <div v-if="carnivalToast" class="notes-editor__toast" role="status" aria-live="polite">
      🎉 你发现了便签宇宙。
    </div>
    <p
      v-if="backupNotice"
      class="notes-editor__backup-notice"
      :class="{ 'notes-editor__backup-notice--error': backupNoticeError }"
      :role="backupNoticeError ? 'alert' : 'status'"
    >
      {{ backupNotice }}
    </p>
  </section>
</template>
