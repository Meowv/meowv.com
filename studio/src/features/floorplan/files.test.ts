import { describe, expect, it } from 'vitest';
import { defaultState, WALLS } from './catalog';
import { newPlanDocument, parsePlanFile, serializePlanFile, validatePlanState } from './files';

describe('户型方案文件', () => {
  it('保留默认家具顺序和全部属性，导入生成独立文档', () => {
    const original = newPlanDocument();
    const imported = parsePlanFile(serializePlanFile(original));
    expect(imported.id).not.toBe(original.id);
    expect(imported.state).toEqual(original.state);
    expect(imported.state.furniture).toHaveLength(46);
    expect(imported.revision).toBe(0);
  });
  it('迁移旧 HTML 状态，补全旧版本缺失的可选字段', () => {
    const state = defaultState();
    const imported = parsePlanFile(JSON.stringify({ furniture: state.furniture }), '旧方案.json');
    expect(imported.title).toBe('旧方案');
    expect(imported.state).toEqual(state);
  });
  it.each([
    [
      '未知家具',
      (state: ReturnType<typeof defaultState>) => {
        state.furniture[0]!.type = 'unknown';
      },
    ],
    [
      '重复 ID',
      (state: ReturnType<typeof defaultState>) => {
        state.furniture[1]!.id = state.furniture[0]!.id;
      },
    ],
    [
      '无效材质',
      (state: ReturnType<typeof defaultState>) => {
        Object.values(state.rooms)[0]!.mat = 'constructor';
      },
    ],
    [
      '非有限坐标',
      (state: ReturnType<typeof defaultState>) => {
        state.furniture[0]!.cx = Infinity;
      },
    ],
    [
      '负尺寸',
      (state: ReturnType<typeof defaultState>) => {
        state.furniture[0]!.w = -1;
      },
    ],
    [
      '异常颜色',
      (state: ReturnType<typeof defaultState>) => {
        state.furniture[0]!.color = 'url(https://example.com/image)';
      },
    ],
    [
      '未知房间',
      (state: ReturnType<typeof defaultState>) => {
        state.rooms.unknown = { name: '未知', mat: 'wood' };
      },
    ],
  ])('拒绝%s且不修改输入', (_, modify) => {
    const state = defaultState();
    modify(state);
    const snapshot = structuredClone(state);
    expect(() => validatePlanState(state)).toThrow('方案文件无效');
    expect(state).toEqual(snapshot);
  });
  it('禁止承重墙和外墙拆除，允许非承重墙及矮墙', () => {
    for (const [index, wall] of WALLS.entries()) {
      const state = defaultState();
      state.demolished = [`w${index}`];
      if (wall[4] === 'b' || wall[4] === 'e')
        expect(() => validatePlanState(state)).toThrow('不能拆除');
      else expect(validatePlanState(state).demolished).toEqual(state.demolished);
    }
  });
  it('拒绝未知版本和模板，避免按旧文件错误降级', () => {
    const doc = newPlanDocument();
    expect(() => parsePlanFile(JSON.stringify({ ...doc, schemaVersion: 2 }))).toThrow('版本');
    expect(() => parsePlanFile(JSON.stringify({ ...doc, templateId: 'other' }))).toThrow('模板');
  });
  it('截断 JSON 和过量实体不会生成部分方案', () => {
    expect(() => parsePlanFile('{"furniture":[')).toThrow('JSON');
    const state = defaultState();
    state.measures = Array.from({ length: 2001 }, () => ({ a: [0, 0], b: [10, 10] }));
    expect(() => validatePlanState(state)).toThrow('测量数量');
  });
});
