import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { solvedFacelets } from '../core/cube';
import { DEFAULT_COLOR_SCHEME } from '../core/constants';
import { useCubeStore } from '../stores/cube-store';
import type { Facelet } from '../types';

const SESSION_KEY = 'meowv-studio:preferences:v1:cube-solver-session';
const SETTINGS_KEY = 'meowv-studio:preferences:v1:cube-solver-settings';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe('cube editor store', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => vi.unstubAllGlobals());

  it('贴纸编辑支持撤销和重做，并递增修订版本', () => {
    const store = useCubeStore();
    store.initialize();
    const original = store.facelets.join('');
    const revision = store.draft.revision;

    store.setSticker('U', 0, 'R');
    expect(store.draft.revision).toBe(revision + 1);
    expect(store.facelets.join('')).not.toBe(original);

    store.undo();
    expect(store.facelets.join('')).toBe(original);
    store.redo();
    expect(store.facelets.join('')).not.toBe(original);
  });

  it('清空时保留固定中心，并允许自动补全唯一缺失颜色', () => {
    const store = useCubeStore();
    store.initialize();
    store.clearDraft();
    expect(store.facelets.filter(Boolean)).toHaveLength(6);

    const almostSolved: Facelet[] = solvedFacelets();
    almostSolved[0] = null;
    store.loadFacelets(almostSolved);
    expect(store.canAutoFill).toBe(true);
    store.autoFill();
    expect(store.facelets[0]).toBe('U');
  });

  it('存在颜色超过九格时不允许自动补全', () => {
    const store = useCubeStore();
    store.initialize();
    const facelets: Facelet[] = solvedFacelets();
    facelets[0] = null;
    facelets[1] = null;
    facelets[9] = 'U';
    store.loadFacelets(facelets);

    expect(store.canAutoFill).toBe(false);
  });

  it('旧 mode/inputMethod 会话仍恢复贴纸并直接进入手动录入流程', () => {
    const storage = createMemoryStorage();
    const facelets = solvedFacelets();
    facelets[0] = 'R';
    const colorScheme = { ...DEFAULT_COLOR_SCHEME, F: '#123456' };
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        version: 1,
        mode: 'beginner',
        inputMethod: 'state',
        facelets: facelets.map((face) => face ?? '-').join(''),
      }),
    );
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        animationSpeed: 1.5,
        colorScheme,
        teachingView: false,
        showMoveArrows: false,
      }),
    );
    vi.stubGlobal('localStorage', storage);

    const store = useCubeStore();
    store.initialize();

    expect(store.facelets.join('')).toBe(facelets.join(''));
    expect('mode' in store).toBe(false);
    expect('inputMethod' in store).toBe(false);
    expect(store.preferences.animationSpeed).toBe(1.5);
    expect(store.preferences.colorScheme.F).toBe('#123456');
    expect('teachingView' in store.preferences).toBe(false);
    expect('showMoveArrows' in store.preferences).toBe(false);
  });
});
