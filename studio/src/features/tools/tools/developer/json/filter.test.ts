import { describe, expect, it } from 'vitest';
import { evaluateJsonFilter, parseJsonFilterPath } from './filter';

describe('parseJsonFilterPath', () => {
  it('解析点号属性和数组下标', () => {
    expect(parseJsonFilterPath('this.users[1].name')).toEqual(['users', '1', 'name']);
  });

  it('解析带引号的对象键', () => {
    expect(parseJsonFilterPath('["display-name"]["zh-CN"]')).toEqual(['display-name', 'zh-CN']);
  });

  it('拒绝函数调用和表达式', () => {
    expect(() => parseJsonFilterPath('.map(item => item.value)')).toThrow();
    expect(() => parseJsonFilterPath('["constructor"]["constructor"]("return 1")()')).toThrow();
  });
});

describe('evaluateJsonFilter', () => {
  const value = {
    users: [
      { name: 'Ada', profile: { active: true } },
      { name: 'Grace', profile: { active: false } },
    ],
  };

  it('读取嵌套对象和数组值', () => {
    expect(evaluateJsonFilter('.users[1].profile.active', value)).toBe(false);
  });

  it('只读取自有属性，不能沿原型链访问构造器', () => {
    expect(evaluateJsonFilter('.constructor', value)).toBeUndefined();
    expect(evaluateJsonFilter('.toString', value)).toBeUndefined();
  });

  it('无法执行原型链构造器表达式', () => {
    expect(() =>
      evaluateJsonFilter('["constructor"]["constructor"]("return globalThis")()', value),
    ).toThrow();
  });

  it('找不到路径时返回 undefined', () => {
    expect(evaluateJsonFilter('.users[9].name', value)).toBeUndefined();
  });
});
