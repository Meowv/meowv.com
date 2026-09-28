import { describe, expect, it } from 'vitest';
import { mergeNotesBackup, parseNotesBackup, serializeNotesBackup } from './backup';
import type { NoteSticky } from './types';

function note(id: string, content: string): NoteSticky {
  return {
    id,
    content,
    color: '#FEF3C7',
    collapsed: false,
    mode: 'preview',
    opacity: 0.85,
    pinned: false,
    x: 20,
    y: 30,
    width: 300,
    height: 220,
    zIndex: 1,
    schemaVersion: 1,
    createdAt: 100,
    updatedAt: 200,
    lastEditedAt: 200,
  };
}

describe('便签备份', () => {
  it('导出的备份可完整读回', () => {
    const notes = [note('a', '第一张'), { ...note('b', '第二张'), pinned: true }];
    expect(parseNotesBackup(serializeNotesBackup(notes))).toEqual(notes);
  });

  it('拒绝错误版本、损坏 JSON 和无效便签', () => {
    expect(() => parseNotesBackup('{')).toThrow('不是有效的 JSON');
    expect(() =>
      parseNotesBackup('{"format":"meowv-studio-notes","version":2,"notes":[]}'),
    ).toThrow('格式或版本不受支持');
    const invalid = JSON.parse(serializeNotesBackup([note('a', '正常')])) as {
      notes: Array<Record<string, unknown>>;
    };
    invalid.notes[0]!.width = -1;
    expect(() => parseNotesBackup(JSON.stringify(invalid))).toThrow('无效的便签数据');
  });

  it('合并时保留现有内容，并为同 ID 的不同版本生成副本', () => {
    const current = [note('a', '当前内容')];
    const imported = [note('a', '备份内容'), note('b', '新便签')];
    const added = mergeNotesBackup(current, imported, () => 'restored');
    expect(current).toEqual([note('a', '当前内容')]);
    expect(added).toEqual([note('restored', '备份内容'), note('b', '新便签')]);
    const currentAfterReload = [...current, ...added].map((item) => ({
      ...item,
      x: item.x + 20,
      zIndex: item.zIndex + 1,
      collapsed: true,
      layoutMode: 'compact' as const,
    }));
    expect(mergeNotesBackup(currentAfterReload, imported, () => 'unused')).toEqual([]);
  });

  it('不同 ID 的相同内容仍按两张独立便签导入', () => {
    expect(mergeNotesBackup([], [note('a', '相同'), note('b', '相同')], () => 'unused')).toEqual([
      note('a', '相同'),
      note('b', '相同'),
    ]);
  });
});
