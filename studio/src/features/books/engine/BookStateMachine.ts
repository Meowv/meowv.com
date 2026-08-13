import { clampSpreadIndex } from './spreads';
import type {
  BookSnapshot,
  BookSnapshotPatch,
  BookState,
  BookStateListener,
} from '../types/reader';

const ALLOWED_TRANSITIONS: Readonly<Record<BookState, readonly BookState[]>> = Object.freeze({
  EMPTY: ['LOADING'],
  LOADING: ['CLOSED', 'EMPTY', 'ERROR'],
  CLOSED: ['OPENING', 'LOADING', 'EMPTY', 'ERROR'],
  OPENING: ['OPEN', 'CLOSING', 'EMPTY', 'ERROR'],
  OPEN: ['DRAGGING', 'TURNING', 'CLOSING', 'ERROR'],
  DRAGGING: ['TURNING', 'SNAPPING_BACK', 'CLOSING', 'EMPTY', 'ERROR'],
  TURNING: ['OPEN', 'EMPTY', 'ERROR'],
  SNAPPING_BACK: ['OPEN', 'EMPTY', 'ERROR'],
  CLOSING: ['CLOSED', 'EMPTY', 'ERROR'],
  ERROR: ['EMPTY', 'LOADING', 'CLOSED'],
});

export class InvalidBookStateTransitionError extends Error {
  readonly from: BookState;
  readonly to: BookState;

  constructor(from: BookState, to: BookState) {
    super(`不允许从 ${from} 转换到 ${to}。`);
    this.name = 'InvalidBookStateTransitionError';
    this.from = from;
    this.to = to;
  }
}

function initialSnapshot(
  initial: BookState | (Partial<BookSnapshot> & Pick<BookSnapshot, 'state'>),
): Readonly<BookSnapshot> {
  const input = typeof initial === 'string' ? { state: initial } : initial;
  const pageCount =
    Number.isInteger(input.pageCount) && (input.pageCount ?? 0) >= 0 ? (input.pageCount ?? 0) : 0;

  return Object.freeze({
    state: input.state,
    previousState: input.previousState ?? null,
    pageCount,
    spreadIndex: clampSpreadIndex(input.spreadIndex ?? 0, pageCount),
    turnDirection: input.turnDirection ?? null,
    error: input.error ?? null,
    changedAt: input.changedAt ?? Date.now(),
  });
}

function normalizePatch(
  state: BookState,
  current: Readonly<BookSnapshot>,
  patch: BookSnapshotPatch,
): Pick<BookSnapshot, 'pageCount' | 'spreadIndex' | 'turnDirection' | 'error'> {
  const pageCount = patch.pageCount ?? current.pageCount;
  if (!Number.isInteger(pageCount) || pageCount < 0) {
    throw new RangeError('pageCount 必须是非负整数。');
  }

  const spreadIndex = clampSpreadIndex(patch.spreadIndex ?? current.spreadIndex, pageCount);
  const keepsDirection = state === 'DRAGGING' || state === 'TURNING' || state === 'SNAPPING_BACK';

  return {
    pageCount,
    spreadIndex,
    turnDirection: keepsDirection ? (patch.turnDirection ?? current.turnDirection) : null,
    error:
      state === 'ERROR' ? (patch.error ?? current.error ?? new Error('仿真书状态异常。')) : null,
  };
}

export class BookStateMachine {
  readonly #listeners = new Set<BookStateListener>();
  #snapshot: Readonly<BookSnapshot>;

  constructor(
    initial: BookState | (Partial<BookSnapshot> & Pick<BookSnapshot, 'state'>) = 'EMPTY',
  ) {
    this.#snapshot = initialSnapshot(initial);
  }

  get state(): BookState {
    return this.#snapshot.state;
  }

  get snapshot(): Readonly<BookSnapshot> {
    return this.#snapshot;
  }

  canTransition(to: BookState): boolean {
    return ALLOWED_TRANSITIONS[this.state].includes(to);
  }

  transition(to: BookState, patch: BookSnapshotPatch = {}): Readonly<BookSnapshot> {
    if (!this.canTransition(to)) {
      throw new InvalidBookStateTransitionError(this.state, to);
    }

    const previousSnapshot = this.#snapshot;
    this.#snapshot = Object.freeze({
      state: to,
      previousState: previousSnapshot.state,
      ...normalizePatch(to, previousSnapshot, patch),
      changedAt: Date.now(),
    });

    for (const listener of this.#listeners) {
      listener(this.#snapshot, previousSnapshot);
    }
    return this.#snapshot;
  }

  subscribe(listener: BookStateListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

export { ALLOWED_TRANSITIONS as BOOK_STATE_TRANSITIONS };
