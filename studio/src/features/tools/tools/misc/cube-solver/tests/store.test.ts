import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { solvedFacelets } from '../core/cube';
import { useCubeStore } from '../stores/cube-store';
import type { Facelet } from '../types';

describe('cube edit history', () => {
  beforeEach(() => setActivePinia(createPinia()));

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

  it('逐个确认扫描低置信度贴纸，并在模式切换时丢弃旧结果', () => {
    const store = useCubeStore();
    store.initialize();
    store.loadFacelets(solvedFacelets(), [
      { face: 'U', index: 0 },
      { face: 'R', index: 0 },
    ]);
    store.setSticker('U', 0, 'U');
    expect(store.lowConfidence).toEqual([{ face: 'R', index: 0 }]);

    store.setSolution({
      mode: 'quick',
      algorithm: '',
      moves: [],
      moveCount: 0,
      baseline: store.position,
      phases: [],
      revision: store.draft.revision,
    });
    store.selectMode('algorithm');
    expect(store.solution).toBeNull();
  });
});
