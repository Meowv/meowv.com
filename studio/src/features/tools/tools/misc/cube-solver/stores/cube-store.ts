import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import {
  applyMoves,
  clonePosition,
  positionToFacelets,
  positionToString,
  solvedFacelets,
  solvedPosition,
} from '../core/cube';
import { CENTER_INDEXES, DEFAULT_COLOR_SCHEME, FACE_OFFSETS } from '../core/constants';
import { formatAlgorithm } from '../core/notation';
import { parseFaceletString, validateFacelets } from '../core/validator';
import {
  FACES,
  type CubeDraft,
  type CubeHistoryItem,
  type CubeInputMethod,
  type CubeMode,
  type CubePosition,
  type CubePreferences,
  type CubeSolution,
  type Face,
  type Facelet,
  type StickerRef,
  type ValidationIssue,
} from '../types';

const SESSION_KEY = `${STORAGE_POLICY.preferences}:cube-solver-session`;
const SETTINGS_KEY = `${STORAGE_POLICY.preferences}:cube-solver-settings`;
const HISTORY_KEY = `${STORAGE_POLICY.preferences}:cube-solver-history`;
const MAX_HISTORY = 20;

interface StoredSession {
  version: 1;
  mode: CubeMode;
  inputMethod: CubeInputMethod;
  facelets: string;
}

const defaultPreferences = (): CubePreferences => ({
  animationSpeed: 1,
  teachingView: true,
  showFaceLabels: true,
  showMoveArrows: true,
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
    teachingView: record.teachingView !== false,
    showFaceLabels: record.showFaceLabels !== false,
    showMoveArrows: record.showMoveArrows !== false,
    colorScheme: FACES.every((face) => typeof record.colorScheme?.[face] === 'string')
      ? { ...record.colorScheme! }
      : fallback.colorScheme,
  };
};

export const useCubeStore = defineStore('cube-solver', () => {
  const mode = ref<CubeMode>('solve');
  const inputMethod = ref<CubeInputMethod>('manual');
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
  const lowConfidence = ref<StickerRef[]>([]);
  const history = ref<CubeHistoryItem[]>([]);
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
  const faceletString = computed(() => positionToString(position.value));
  const colorCounts = computed<Record<Face, number>>(
    () =>
      Object.fromEntries(
        FACES.map((face) => [face, draft.value.facelets.filter((value) => value === face).length]),
      ) as Record<Face, number>,
  );
  const canAutoFill = computed(() => {
    const missing = draft.value.facelets.filter((value) => value === null).length;
    const remaining = FACES.filter((face) => colorCounts.value[face] < 9);
    return (
      missing > 0 && remaining.length === 1 && 9 - colorCounts.value[remaining[0]!] === missing
    );
  });
  const currentMove = computed(() => solution.value?.moves[playbackCursor.value] ?? null);
  const currentPhase = computed(() => {
    const phases = solution.value?.phases ?? [];
    return (
      phases.find(
        (phase) => playbackCursor.value >= phase.start && playbackCursor.value < phase.end,
      ) ?? phases.at(-1)
    );
  });

  function persistSession(): void {
    if (!initialized.value || !canUseStorage()) return;
    const session: StoredSession = {
      version: 1,
      mode: mode.value,
      inputMethod: inputMethod.value,
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

  function persistHistory(): void {
    if (!initialized.value || !canUseStorage()) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value));
    } catch {
      // 历史记录保存失败不影响求解。
    }
  }

  function initialize(): void {
    if (initialized.value) return;
    if (canUseStorage()) {
      try {
        const storedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as unknown;
        preferences.value = normalizePreferences(storedSettings);
        const storedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown;
        history.value = Array.isArray(storedHistory)
          ? (
              storedHistory.filter(
                (item): item is CubeHistoryItem =>
                  Boolean(item) &&
                  typeof item === 'object' &&
                  typeof (item as CubeHistoryItem).initialFacelets === 'string' &&
                  typeof (item as CubeHistoryItem).solution === 'string',
              ) as CubeHistoryItem[]
            ).slice(0, MAX_HISTORY)
          : [];
        const storedSession = JSON.parse(
          localStorage.getItem(SESSION_KEY) ?? 'null',
        ) as Partial<StoredSession> | null;
        const restored = parseStoredDraft(storedSession?.facelets);
        if (restored) {
          mode.value = ['solve', 'algorithm', 'practice', 'beginner'].includes(
            String(storedSession?.mode),
          )
            ? (storedSession!.mode as CubeMode)
            : 'solve';
          inputMethod.value = ['manual', 'camera', 'state'].includes(
            String(storedSession?.inputMethod),
          )
            ? (storedSession!.inputMethod as CubeInputMethod)
            : 'manual';
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
    lowConfidence.value = [];
    invalidateAsyncWork();
    validateCurrent();
  }

  function setSticker(face: Face, index: number, color: Facelet = selectedColor.value): void {
    const absoluteIndex = FACE_OFFSETS[face] + index;
    if (CENTER_INDEXES.includes(absoluteIndex as (typeof CENTER_INDEXES)[number])) return;
    const next = [...draft.value.facelets];
    const remainingConfidence = lowConfidence.value.filter(
      (sticker) => sticker.face !== face || sticker.index !== index,
    );
    if (next[absoluteIndex] === color) {
      lowConfidence.value = remainingConfidence;
      return;
    }
    next[absoluteIndex] = color;
    replaceDraft(next);
    lowConfidence.value = remainingConfidence;
  }

  function clearDraft(): void {
    const next = Array<Facelet>(54).fill(null);
    CENTER_INDEXES.forEach((absoluteIndex, faceIndex) => {
      next[absoluteIndex] = FACES[faceIndex]!;
    });
    replaceDraft(next);
  }

  function resetSolved(): void {
    replaceDraft(solvedFacelets());
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

  function loadFacelets(next: readonly Facelet[], confidence: StickerRef[] = []): boolean {
    if (next.length !== 54) return false;
    replaceDraft([...next]);
    lowConfidence.value = confidence;
    return editStatus.value === 'valid';
  }

  function loadFaceletString(value: string): boolean {
    const parsed = parseFaceletString(value);
    if (!parsed) {
      validationIssues.value = [
        { code: 'INCOMPLETE', message: '状态字符串必须是 54 位 URFDLB 字符。' },
      ];
      editStatus.value = 'invalid';
      return false;
    }
    return loadFacelets(parsed);
  }

  function setPosition(next: CubePosition, clearResult = true): void {
    position.value = clonePosition(next);
    draft.value = {
      facelets: positionToFacelets(next),
      revision: draft.value.revision + 1,
    };
    editStatus.value = 'valid';
    validationIssues.value = [];
    if (clearResult) {
      solution.value = null;
      playbackCursor.value = 0;
    }
    invalidateAsyncWork();
  }

  function selectMode(next: CubeMode): void {
    if (mode.value === next) return;
    mode.value = next;
    solution.value = null;
    playbackCursor.value = 0;
    playbackStatus.value = 'paused';
    solverStatus.value = 'idle';
    solverMessage.value = '';
    generation.value += 1;
  }

  function setSolution(next: CubeSolution): void {
    solution.value = next;
    playbackCursor.value = 0;
    playbackStatus.value = 'paused';
    solverStatus.value = 'ready';
    position.value = clonePosition(next.baseline);
    draft.value = { facelets: positionToFacelets(position.value), revision: draft.value.revision };
  }

  function seek(cursor: number): void {
    if (!solution.value) return;
    const target = Math.max(0, Math.min(solution.value.moves.length, Math.round(cursor)));
    playbackCursor.value = target;
    position.value = applyMoves(solution.value.baseline, solution.value.moves.slice(0, target));
    draft.value = { facelets: positionToFacelets(position.value), revision: draft.value.revision };
    playbackStatus.value = target === solution.value.moves.length ? 'completed' : 'paused';
  }

  function addHistory(source: CubeHistoryItem['source'], result: CubeSolution): void {
    if (!result.moves.length) return;
    history.value = [
      {
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`,
        createdAt: Date.now(),
        initialFacelets: positionToString(result.baseline),
        solution: formatAlgorithm(result.moves),
        moveCount: result.moveCount,
        source,
      },
      ...history.value,
    ].slice(0, MAX_HISTORY);
  }

  function removeHistory(id: string): void {
    history.value = history.value.filter((item) => item.id !== id);
  }

  function clearHistory(): void {
    history.value = [];
  }

  function loadHistory(item: CubeHistoryItem): boolean {
    inputMethod.value = 'state';
    mode.value = 'solve';
    return loadFaceletString(item.initialFacelets);
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

  watch([mode, inputMethod, () => draft.value.facelets], scheduleSessionPersistence);
  watch(preferences, schedulePreferencesPersistence, { deep: true });
  watch(history, persistHistory, { deep: true });

  return {
    mode,
    inputMethod,
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
    lowConfidence,
    history,
    preferences,
    generation,
    undoStack,
    redoStack,
    facelets,
    faceletString,
    colorCounts,
    canAutoFill,
    currentMove,
    currentPhase,
    initialize,
    validateCurrent,
    setSticker,
    clearDraft,
    resetSolved,
    autoFill,
    undo,
    redo,
    loadFacelets,
    loadFaceletString,
    setPosition,
    selectMode,
    setSolution,
    seek,
    addHistory,
    removeHistory,
    clearHistory,
    loadHistory,
  };
});
