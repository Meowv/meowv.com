import { describe, expect, it } from 'vitest';
import {
  MAX_HOLIDAY_BYTES,
  mergeHolidaySnapshots,
  parseBackupHolidays,
  parsePrimaryHolidays,
  resolveHolidayData,
  restoreHolidaySnapshot,
} from '../holiday.service';
import type { HolidayEvent } from '../types';

function annualTable(year = 2026) {
  return [
    ['元旦', '01-01', '01-03', 3, ['01-04']],
    ['春节', '02-15', '02-23', 9, ['02-14', '02-28']],
    ['清明节', '04-04', '04-06', 3, []],
    ['劳动节', '05-01', '05-05', 5, ['05-09']],
    ['端午节', '06-19', '06-21', 3, []],
    ['中秋节', '09-25', '09-27', 3, []],
    ['国庆节', '10-01', '10-07', 7, ['09-20', '10-10']],
  ].map(([name, start, end, duration, compDays]) => ({
    Name: name as string,
    StartDate: `${year}-${start}`,
    EndDate: `${year}-${end}`,
    Duration: duration as number,
    CompDays: (compDays as string[]).map((date) => `${year}-${date}`),
    URL: 'https://example.com/announcement',
    Memo: '固定测试数据，不代表实际年度安排',
  }));
}

function primaryInput(year = 2026) {
  return {
    Name: '测试日历',
    Version: '1.0',
    Generated: '20251104T235904Z',
    Timezone: 'Asia/Shanghai',
    Years: { [year]: annualTable(year) },
  };
}

function calendar(...entries: string[]) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...entries, 'END:VCALENDAR'].join('\r\n');
}

function entry(date = '20260101', extra: string[] = [], title = '名称不决定休班类型') {
  return [
    'BEGIN:VEVENT',
    `UID:${date}-${title}`,
    `DTSTART;VALUE=DATE:${date}`,
    `SUMMARY:${title}`,
    ...extra,
    'END:VEVENT',
  ].join('\r\n');
}

function backup(rest = entry(), work = entry('20260104')) {
  return parseBackupHolidays(calendar(rest), calendar(work), 2);
}

function statusOn(events: HolidayEvent[], day: string) {
  return events.filter((event) => event.date <= day && event.endDate! > day);
}

describe('parsePrimaryHolidays', () => {
  it('转换包含式结束日期，关联假期与每个补班，保留声明时间', () => {
    const snapshot = parsePrimaryHolidays(primaryInput(), 100);
    const holiday = snapshot.events.find((event) => event.title === '国庆节')!;
    const workday = snapshot.events.find((event) => event.date === '2026-10-10')!;
    expect(snapshot.coverage).toEqual({ 2026: 'complete' });
    expect(snapshot.updatedAt).toBe('20251104T235904Z');
    expect(snapshot.fetchedAt).toBe(100);
    expect(snapshot.events).toHaveLength(13);
    expect(holiday).toMatchObject({ date: '2026-10-01', endDate: '2026-10-08', type: 'dayoff' });
    expect(workday).toMatchObject({
      endDate: '2026-10-11',
      type: 'workday',
      period: holiday.period,
    });
    expect(holiday.period?.compDays).toEqual(['2026-09-20', '2026-10-10']);
    expect(statusOn(snapshot.events, '2026-10-07')).toHaveLength(1);
    expect(statusOn(snapshot.events, '2026-10-08')).toHaveLength(0);
  });

  it('接受中秋与国庆合并的六条完整年度记录', () => {
    const input = primaryInput(2025);
    input.Years[2025]!.splice(5, 1);
    input.Years[2025]![5]!.Name = '中秋节、国庆节';
    expect(parsePrimaryHolidays(input, 0).coverage[2025]).toBe('complete');
  });

  it('跨年开始日期与补班不偏移，只有明确年度为完整', () => {
    const input = primaryInput(2027);
    input.Years[2027]![0] = {
      ...input.Years[2027]![0]!,
      StartDate: '2026-12-31',
      Duration: 4,
      CompDays: ['2026-12-27'],
    };
    const snapshot = parsePrimaryHolidays(input, 1);
    expect(snapshot.coverage).toEqual({ 2026: 'partial', 2027: 'complete' });
    expect(snapshot.events.find((event) => event.title === '元旦')).toMatchObject({
      date: '2026-12-31',
      endDate: '2027-01-04',
    });
    expect(snapshot.events[0]!.date).toBe('2026-12-27');
  });

  it.each([
    [
      '缺少年度',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years = {};
      },
    ],
    [
      '部分年度',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]!.pop();
      },
    ],
    [
      '重复名称',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![6]!.Name = '元旦';
      },
    ],
    [
      '未知名称',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![6]!.Name = '非国庆节';
      },
    ],
    [
      '天数不符',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![0]!.Duration = 4;
      },
    ],
    [
      '日期不存在',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![1]!.StartDate = '2026-02-30';
      },
    ],
    [
      '无效补班日期',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![0]!.CompDays = ['2026-01-32'];
      },
    ],
    [
      '重复补班',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![0]!.CompDays = ['2026-01-04', '2026-01-04'];
      },
    ],
    [
      '休班冲突',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![0]!.CompDays = ['2026-01-01'];
      },
    ],
    [
      '过远补班',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![0]!.CompDays = ['2026-12-01'];
      },
    ],
    [
      '错属年度',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![0]!.StartDate = '2027-01-01';
        input.Years[2026]![0]!.EndDate = '2027-01-03';
      },
    ],
    [
      '时区变更',
      (input: ReturnType<typeof primaryInput>) => {
        input.Timezone = 'UTC';
      },
    ],
    [
      '危险公告地址',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![0]!.URL = 'javascript:alert(1)';
      },
    ],
    [
      '携带凭据的地址',
      (input: ReturnType<typeof primaryInput>) => {
        input.Years[2026]![0]!.URL = 'https://example:placeholder@example.com';
      },
    ],
  ])('拒绝%s，不能错误声明完整年度', (_name, mutate) => {
    const input = primaryInput();
    mutate(input);
    expect(() => parsePrimaryHolidays(input, 1)).toThrow();
  });

  it('拒绝格式变化、越界年份、过大内容和无效时间', () => {
    expect(() => parsePrimaryHolidays(null, 1)).toThrow();
    expect(() => parsePrimaryHolidays({ ...primaryInput(), Years: [] }, 1)).toThrow();
    expect(() => parsePrimaryHolidays(primaryInput(2101), 1)).toThrow();
    expect(() =>
      parsePrimaryHolidays({ ...primaryInput(), Memo: 'a'.repeat(MAX_HOLIDAY_BYTES) }, 1),
    ).toThrow();
    expect(() => parsePrimaryHolidays(primaryInput(), NaN)).toThrow();
  });
});

describe('parseBackupHolidays', () => {
  it('缺少 DTEND 为一天，类型由源决定而非名称，覆盖始终为部分', () => {
    const snapshot = backup(entry('20260101', [], '上班'), entry('20260104', [], '休息'));
    expect(snapshot.events[0]).toMatchObject({
      type: 'dayoff',
      title: '上班',
      date: '2026-01-01',
      endDate: '2026-01-02',
    });
    expect(snapshot.events[1]).toMatchObject({ type: 'workday', title: '休息' });
    expect(snapshot.events.every((event) => !event.period)).toBe(true);
    expect(snapshot.coverage).toEqual({ 2026: 'partial' });
  });

  it('保持 ICS 排他结束日期与折行文本', () => {
    const snapshot = backup(
      entry('20251231', ['DTEND;VALUE=DATE:20260103', 'DESCRIPTION:假期', ' 第一天']),
    );
    expect(snapshot.events[0]).toMatchObject({
      date: '2025-12-31',
      endDate: '2026-01-03',
      description: '假期第一天',
    });
    expect(snapshot.coverage).toEqual({ 2025: 'partial', 2026: 'partial' });
  });

  it.each([
    'RRULE:FREQ=DAILY',
    'RRULE:FREQ=SECONDLY;COUNT=999999999',
    'RDATE;VALUE=DATE:20260102',
    'RECURRENCE-ID;VALUE=DATE:20260101',
    'DTEND;VALUE=DATE:20290101',
    'DTEND;VALUE=DATE:20260101',
    'DURATION:P99999999D',
  ])('拒绝无界规则或不支持的区间：%s', (property) => {
    expect(() => backup(entry('20260101', [property]))).toThrow();
  });

  it('拒绝时刻日期、无效日期、冲突、重复事件及单侧坏数据', () => {
    expect(() =>
      backup(entry().replace('DTSTART;VALUE=DATE:20260101', 'DTSTART:20260101T000000Z')),
    ).toThrow();
    expect(() => backup(entry('20260230'))).toThrow();
    expect(() => backup(entry('20260104'))).toThrow(/冲突/);
    expect(() =>
      parseBackupHolidays(calendar(entry(), entry()), calendar(entry('20260104')), 1),
    ).toThrow(/重复/);
    expect(() => parseBackupHolidays(calendar(entry()), 'not ICS', 1)).toThrow();
    expect(() =>
      parseBackupHolidays('a'.repeat(MAX_HOLIDAY_BYTES + 1), calendar(entry('20260104')), 1),
    ).toThrow();
  });
});

describe('缓存合并与年度解析', () => {
  it('主源旧缓存优先于更新的备用源，同一年绝不混合来源', () => {
    const primary = parsePrimaryHolidays(primaryInput(), 1);
    const fallback = backup(entry('20260104'), entry('20260101'));
    const result = resolveHolidayData([fallback, primary]);
    expect(result.sourcesByYear[2026]).toBe('lanceliao');
    expect(statusOn(result.events, '2026-01-04').map((event) => event.type)).toEqual(['workday']);
    expect(result.events.every((event) => event.source === 'lanceliao')).toBe(true);
    expect(result.coverage[2027]).toBe('unavailable');
  });

  it('新增 2027 年保留缓存中 2026 完整年度', () => {
    const previous = parsePrimaryHolidays(primaryInput(), 1);
    const incoming = parsePrimaryHolidays(primaryInput(2027), 2);
    const merged = mergeHolidaySnapshots(previous, incoming);
    expect(merged.coverage).toEqual({ 2026: 'complete', 2027: 'complete' });
    expect(merged.events).toHaveLength(26);
    expect(resolveHolidayData([incoming, previous]).coverage[2027]).toBe('complete');
    expect(restoreHolidaySnapshot(JSON.parse(JSON.stringify(merged)), 'lanceliao')).toEqual(merged);
  });

  it('完整替换年度归属，跨年开始和补班不会遗留旧版本', () => {
    const oldInput = primaryInput();
    oldInput.Years[2026]![0]!.StartDate = '2025-12-31';
    oldInput.Years[2026]![0]!.Duration = 4;
    oldInput.Years[2026]![0]!.CompDays = ['2025-12-28'];
    const previous = parsePrimaryHolidays(oldInput, 1);
    const incoming = parsePrimaryHolidays(primaryInput(), 2);
    const merged = mergeHolidaySnapshots(previous, incoming);
    expect(merged).toEqual(incoming);
    expect(merged.events.some((event) => event.date.startsWith('2025'))).toBe(false);
    expect(mergeHolidaySnapshots(incoming, previous)).toEqual(incoming);
  });

  it('按日历年选择备用数据，裁剪索引不修改原假期边界', () => {
    const input = primaryInput(2027);
    input.Years[2027]![0]!.StartDate = '2026-12-31';
    input.Years[2027]![0]!.Duration = 4;
    const primary = parsePrimaryHolidays(input, 1);
    const result = resolveHolidayData([primary, backup(entry('20261231'), entry('20261230'))]);
    expect(result.sourcesByYear[2026]).toBe('muhac');
    expect(result.sourcesByYear[2027]).toBe('lanceliao');
    const newYear = result.events.find((event) => event.title === '元旦')!;
    expect(newYear).toMatchObject({
      date: '2027-01-01',
      endDate: '2027-01-04',
      period: { startDate: '2026-12-31', endDate: '2027-01-04' },
    });
    expect(
      result.events
        .filter((event) => event.date.startsWith('2026'))
        .every((event) => event.source === 'muhac'),
    ).toBe(true);
    expect(primary.events.find((event) => event.title === '元旦')!.date).toBe('2026-12-31');
  });

  it('备用更新原子替换相同日历年并保留跨年区间的旧年部分', () => {
    const previous = backup(entry('20251231', ['DTEND;VALUE=DATE:20260103']));
    const incoming = { ...backup(entry('20260106'), entry('20260107')), fetchedAt: 3 };
    const merged = mergeHolidaySnapshots(previous, incoming);
    expect(statusOn(merged.events, '2025-12-31')).toHaveLength(1);
    expect(statusOn(merged.events, '2026-01-01')).toHaveLength(0);
    expect(restoreHolidaySnapshot(JSON.parse(JSON.stringify(merged)), 'muhac')).toEqual(merged);
    expect(mergeHolidaySnapshots(merged, { ...incoming, fetchedAt: 4 }).events).toEqual(
      merged.events,
    );
  });

  it('缓存校验拒绝伪造完整年份、事件与假期关系变更', () => {
    const primary = parsePrimaryHolidays(primaryInput(), 1);
    expect(restoreHolidaySnapshot(JSON.parse(JSON.stringify(primary)), 'lanceliao')).toEqual(
      primary,
    );
    const corrupted = structuredClone(primary);
    corrupted.events[0]!.date = '2026-01-02';
    expect(() => restoreHolidaySnapshot(corrupted, 'lanceliao')).toThrow();
    const fallback = backup();
    fallback.coverage[2026] = 'complete';
    expect(() => restoreHolidaySnapshot(fallback, 'muhac')).toThrow();
    expect(() => restoreHolidaySnapshot(primary, 'muhac')).toThrow();
  });
});
