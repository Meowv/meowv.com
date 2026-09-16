import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import {
  applyMoves,
  clonePosition,
  positionToFacelets,
  solvedFacelets,
  solvedPosition,
} from '../core/cube';
import { CENTER_INDEXES, DEFAULT_COLOR_SCHEME, FACE_OFFSETS } from '../core/constants';
import { validateFacelets } from '../core/validator';
import {
  FACES,
  type CubeDraft,
  type CubePosition,
  type CubePreferences,
  type CubeSolution,
  type Face,
  type Facelet,
  type ValidationIssue,
} from '../types';

const SESSION_KEY = `${STORAGE_POLICY.preferences}:cube-solver-session`;
const SETTINGS_KEY = `${STORAGE_POLICY.preferences}:cube-solver-settings`;

interface StoredSession {
  version: 1;
  facelets: string;
}

const defaultPreferences = (): CubePreferences => ({
  animationSpeed: 1,
  colorScheme: { ...DEFAULT_COLOR_SCHEME },
});

const draftString = (facelets: readonly Facelet[]): string =>
  facelets.map((face) => face ?? '-').join('');

const parseStoredDraft = (value: unknown): Facelet[] | null => {
  if (typeof value !== 'string' || value.length !== 54) return null;
  const parsed = [...value].map((character) =>
    character === '-' ? null : FACES.includes(character as Face) ? (character as Face) : undefined,
  );
  return parsed.some((value) => typeof value === 'undefined') ? null : (parsed as Facelet[]);
};

const normalizePreferences = (value: unknown): CubePreferences => {
  const fallback = defaultPreferences();
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Partial<CubePreferences>;
  const speed = Number(record.animationSpeed);
  return {
    animationSpeed: [0.25, 0.5, 0.75, 1, 1.5, 2, 3].includes(speed) ? speed : 1,
    colorScheme: FACES.every((face) => typeof record.colorScheme?.[face] === 'string')
      ? { ...record.colorScheme! }
      : fallback.colorScheme,
  };
};

export const useCubeStore = defineStore('cube-solver', () => {
  const draft = ref<CubeDraft>({ facelets: solvedFacelets(), revision: 0 });
  const position = ref<CubePosition>(solvedPosition());
  const validationIssues = ref<ValidationIssue[]>([]);
  const editStatus = ref<'draft' | 'invalid' | 'valid'>('valid');
  const solverStatus = ref<'idle' | 'loading' | 'solving' | 'ready' | 'error'>('idle');
  const solverMessage = ref('');
  const solution = ref<CubeSolution | null>(null);
  const playbackCursor = ref(0);
  const playbackStatus = ref<'idle' | 'paused' | 'playing' | 'completed'>('idle');
  const selectedColor = ref<Face>('U');
  const activeFace = ref<Face>('F');
  const preferences = ref<CubePreferences>(defaultPreferences());
  const generation = ref(0);
  const undoStack = ref<string[]>([]);
  const redoStack = ref<string[]>([]);
  const initialized = ref(false);
  let storageEnabled: boolean | null = null;

  const canUseStorage = (): boolean => {
    storageEnabled ??= storageAvailable();
    return storageEnabled;
  };

  const facelets = computed(() => draft.value.facelets);
  const colorCounts = computed<Record<Face, number>>(
    () =>
      Object.fromEntries(
        FACES.map((face) => [face, draft.value.facelets.filter((value) => value === face).length]),
      ) as Record<Face, number>,
  );
  const canAutoFill = computed(() => {
    const missing = draft.value.facelets.filter((value) => value === null).length;
    const remaining = FACES.filter((face) => colorCounts.value[face] < 9);
    const hasExcess = FACES.some((face) => colorCounts.value[face] > 9);
    return (
      missing > 0 &&
      !hasExcess &&
      remaining.length === 1 &&
      9 - colorCounts.value[remaining[0]!] === missing
    );
  });
  const currentMove = computed(() => solution.value?.moves[playbackCursor.value] ?? null);

  function persistSession(): void {
    if (!initialized.value || !canUseStorage()) return;
    const session: StoredSession = {
      version: 1,
      facelets: draftString(draft.value.facelets),
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // 本地存储不可用时保留当前内存状态。
    }
  }

  function persistPreferences(): void {
    if (!initialized.value || !canUseStorage()) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences.value));
    } catch {
      // 设置保存失败不影响当前会话。
    }
  }

  function initialize(): void {
    if (initialized.value) return;
    if (canUseStorage()) {
      try {
        preferences.value = normalizePreferences(
          JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as unknown,
        );
        const storedSession = JSON.parse(
          localStorage.getItem(SESSION_KEY) ?? 'null',
        ) as Partial<StoredSession> | null;
        const restored = parseStoredDraft(storedSession?.facelets);
        if (restored) {
          // 旧版本可能写入 mode/inputMethod，本版本忽略它们并统一回到手动录入。
          draft.value = { facelets: restored, revision: 0 };
          validateCurrent();
        }
      } catch {
        // 损坏的本地记录直接忽略。
      }
    }
    initialized.value = true;
  }

  function invalidateAsyncWork(): void {
    generation.value += 1;
    playbackStatus.value = 'paused';
    solverStatus.value = 'idle';
    solverMessage.value = '';
  }

  function validateCurrent(): boolean {
    const result = validateFacelets(draft.value.facelets);
    validationIssues.value = result.issues;
    if (result.valid) {
      position.value = result.position;
      editStatus.value = 'valid';
      return true;
    }
    editStatus.value = draft.value.facelets.some((value) => value === null) ? 'draft' : 'invalid';
    return false;
  }

  function replaceDraft(next: Facelet[], recordUndo = true): void {
    if (recordUndo) {
      undoStack.value.push(draftString(draft.value.facelets));
      if (undoStack.value.length > 100) undoStack.value.shift();
      redoStack.value = [];
    }
    draft.value = { facelets: [...next], revision: draft.value.revision + 1 };
    solution.value = null;
    playbackCursor.value = 0;
    invalidateAsyncWork();
    validateCurrent();
  }

  function setSticker(face: Face, index: number, color: Facelet = selectedColor.value): void {
    const absoluteIndex = FACE_OFFSETS[face] + index;
    if (CENTER_INDEXES.includes(absoluteIndex as (typeof CENTER_INDEXES)[number])) return;
    const next = [...draft.value.facelets];
    if (next[absoluteIndex] === color) return;
    next[absoluteIndex] = color;
    replaceDraft(next);
  }

  function clearDraft(): void {
    const next = Array<Facelet>(54).fill(null);
    CENTER_INDEXES.forEach((absoluteIndex, faceIndex) => {
      next[absoluteIndex] = FACES[faceIndex]!;
    });
    replaceDraft(next);
  }

  function autoFill(): void {
    if (!canAutoFill.value) return;
    const remaining = FACES.find((face) => colorCounts.value[face] < 9);
    if (!remaining) return;
    replaceDraft(draft.value.facelets.map((value) => value ?? remaining));
  }

  function undo(): void {
    const previous = undoStack.value.pop();
    if (!previous) return;
    redoStack.value.push(draftString(draft.value.facelets));
    const restored = parseStoredDraft(previous);
    if (restored) replaceDraft(restored, false);
  }

  function redo(): void {
    const next = redoStack.value.pop();
    if (!next) return;
    undoStack.value.push(draftString(draft.value.facelets));
    const restored = parseStoredDraft(next);
    if (restored) replaceDraft(restored, false);
  }

  function loadFacelets(next: readonly Facelet[]): boolean {
    if (next.length !== 54) return false;
    replaceDraft([...next]);
    return editStatus.value === 'valid';
  }

  function setSolution(next: CubeSolution): void {
    solution.value = next;
    playbackCursor.value = 0;
    playbackStatus.value = 'paused';
    solverStatus.value = 'ready';
    position.value = clonePosition(next.baseline);
    draft.value = { facelets: positionToFacelets(position.value), revision: draft.value.revision };
    validationIssues.value = [];
    editStatus.value = 'valid';
  }

  function seek(cursor: number): void {
    if (!solution.value) return;
    const target = Math.max(0, Math.min(solution.value.moves.length, Math.round(cursor)));
    playbackCursor.value = target;
    position.value = applyMoves(solution.value.baseline, solution.value.moves.slice(0, target));
    draft.value = { facelets: positionToFacelets(position.value), revision: draft.value.revision };
    playbackStatus.value = target === solution.value.moves.length ? 'completed' : 'paused';
  }

  const debouncePersistence = (persist: () => void): (() => void) => {
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    return () => {
      if (timer !== undefined) globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(() => {
        timer = undefined;
        persist();
      }, 250);
    };
  };
  const scheduleSessionPersistence = debouncePersistence(persistSession);
  const schedulePreferencesPersistence = debouncePersistence(persistPreferences);

  watch(() => draft.value.facelets, scheduleSessionPersistence);
  watch(preferences, schedulePreferencesPersistence, { deep: true });

  return {
    draft,
    position,
    validationIssues,
    editStatus,
    solverStatus,
    solverMessage,
    solution,
    playbackCursor,
    playbackStatus,
    selectedColor,
    activeFace,
    preferences,
    generation,
    undoStack,
    redoStack,
    facelets,
    colorCounts,
    canAutoFill,
    currentMove,
    initialize,
    validateCurrent,
    setSticker,
    clearDraft,
    autoFill,
    undo,
    redo,
    loadFacelets,
    setSolution,
    seek,
  };
});
