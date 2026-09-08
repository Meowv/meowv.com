import { afterEach, describe, expect, it, vi } from 'vitest';
import { LunarYear } from 'lunar-javascript';
import {
  calculateDateRange,
  convertLunarToSolar,
  getHolidayCountdown,
  getHolidayPeriods,
  getLunarMonths,
  getUpcomingFestival,
  getYearSolarTerms,
} from '../calendar-query.util';
import type { CalendarCoverage, DateKey, HolidayEvent, HolidayPeriod } from '../types';

const period: HolidayPeriod = {
  id: 'national-2026',
  title: '国庆节',
  startDate: '2026-10-01',
  endDate: '2026-10-08',
  compDays: ['2026-10-10'],
  source: 'lanceliao',
};
const inclusive = { includeStart: true, includeEnd: true };
const complete: Record<number, CalendarCoverage> = { 2026: 'complete' };

function holiday(overrides: Partial<HolidayEvent> = {}): HolidayEvent {
  return {
    id: 'national',
    title: '国庆节',
    date: '2026-10-01',
    endDate: '2026-10-08',
    allDay: true,
    type: 'dayoff',
    source: 'lanceliao',
    period,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('假期总览', () => {
  it('倒计时按已解析的年度来源选择，不让相邻年原始区间反向泄漏', () => {
    const nextYear = holiday({
      id: 'next-year',
      date: '2027-01-01',
      endDate: '2027-01-03',
      period: {
        ...period,
        title: '主源元旦',
        startDate: '2026-12-31',
        endDate: '2027-01-03',
        compDays: [],
      },
    });
    const backup = holiday({
      id: 'backup-year',
      title: '备用已收录休息日',
      source: 'muhac',
      date: '2026-12-31',
      endDate: '2027-01-01',
      period: undefined,
    });
    expect(getHolidayCountdown('2026-12-31', [nextYear, backup])).toMatchObject({
      title: '备用已收录休息日',
      date: '2026-12-31',
      ongoing: true,
      remainingDays: 1,
    });
    expect(getHolidayCountdown('2026-12-31', [nextYear])).toMatchObject({
      title: '主源元旦',
      date: '2027-01-01',
      ongoing: false,
      daysUntil: 1,
    });
  });
  it('逐日与补班事件的同一原始区间去重，补班日期排序且不修改来源对象', () => {
    const linked = { ...period, compDays: ['2026-10-11', '2026-10-10', '2026-10-11'] as DateKey[] };
    const events = [
      holiday(),
      holiday({ id: 'day-two', date: '2026-10-02', period: linked }),
      holiday({ id: 'work', date: '2026-10-10', endDate: undefined, type: 'workday' }),
    ];
    const periods = getHolidayPeriods(events);
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      startDate: '2026-10-01',
      endDate: '2026-10-08',
      compDays: ['2026-10-10', '2026-10-11'],
    });
    expect(period.compDays).toEqual(['2026-10-10']);
    expect(linked.compDays).toHaveLength(3);
  });

  it('备用源只保留明确提供的单日或多日区间，不拼接相邻日期或推测补班关联', () => {
    const events = [
      holiday({
        id: 'second',
        date: '2026-10-02',
        endDate: undefined,
        source: 'muhac',
        period: undefined,
      }),
      holiday({ id: 'first', endDate: undefined, source: 'muhac', period: undefined }),
      holiday({
        id: 'work',
        date: '2026-10-10',
        type: 'workday',
        endDate: undefined,
        period: undefined,
      }),
      holiday({ id: 'ordinary', type: 'holiday', period: undefined }),
    ];
    expect(getHolidayPeriods(events)).toEqual([
      {
        id: 'first',
        title: '国庆节',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        compDays: [],
        source: 'muhac',
      },
      {
        id: 'second',
        title: '国庆节',
        startDate: '2026-10-02',
        endDate: '2026-10-03',
        compDays: [],
        source: 'muhac',
      },
    ]);
    expect(getHolidayPeriods([holiday({ period: undefined, source: 'muhac' })])[0].endDate).toBe(
      '2026-10-08',
    );
  });

  it('无效或反向区间不产生假期', () => {
    expect(
      getHolidayPeriods([
        holiday({ period: undefined, endDate: '2026-10-01' }),
        holiday({ period: { ...period, endDate: '2026-02-30' } }),
        holiday({ period: undefined, date: '2026-02-30' }),
      ]),
    ).toEqual([]);
  });
});

describe('日期区间计算', () => {
  const events = [
    holiday({ title: '劳动节', date: '2026-05-01', endDate: '2026-05-04', period: undefined }),
    holiday({
      title: '补班',
      date: '2026-05-02',
      endDate: undefined,
      type: 'workday',
      period: undefined,
    }),
  ];

  it('完整年份中准确处理周末补班、工作日休假与排他结束日期', () => {
    expect(calculateDateRange('2026-05-01', '2026-05-05', inclusive, events, complete)).toEqual({
      naturalDays: 5,
      weekendDays: 2,
      workDays: 3,
      restDays: 2,
      estimated: false,
      missingYears: [],
    });
  });

  it.each([
    [true, true, 5, 2],
    [false, true, 4, 1],
    [true, false, 4, 2],
    [false, false, 3, 1],
  ] as const)(
    '区间端点 includeStart=%s includeEnd=%s',
    (includeStart, includeEnd, naturalDays, restDays) => {
      const result = calculateDateRange(
        '2026-05-01',
        '2026-05-05',
        { includeStart, includeEnd },
        events,
        complete,
      );
      expect(result.naturalDays).toBe(naturalDays);
      expect(result.restDays).toBe(restDays);
      expect(result.weekendDays).toBe(2);
      expect(result.workDays + result.restDays).toBe(result.naturalDays);
    },
  );

  it.each([
    [true, true, 1],
    [false, true, 0],
    [true, false, 0],
    [false, false, 0],
  ] as const)(
    '同日区间 includeStart=%s includeEnd=%s 不产生负数或重复计数',
    (includeStart, includeEnd, naturalDays) => {
      const result = calculateDateRange(
        '2026-05-01',
        '2026-05-01',
        { includeStart, includeEnd },
        events,
        complete,
      );
      expect(result.naturalDays).toBe(naturalDays);
      expect(result.restDays).toBe(naturalDays);
      expect(result.workDays).toBe(0);
    },
  );

  it('不包含任何日期时不要求年度覆盖，包括区间边界', () => {
    for (const date of ['1900-01-01', '2026-12-31', '2100-12-31'] as const) {
      expect(
        calculateDateRange(date, date, { includeStart: false, includeEnd: false }, [], {}),
      ).toEqual({
        naturalDays: 0,
        weekendDays: 0,
        workDays: 0,
        restDays: 0,
        estimated: false,
        missingYears: [],
      });
    }
  });

  it.each(['partial', 'unavailable', undefined] as const)(
    '覆盖 %s 时整个区间仅按周末估算',
    (coverage) => {
      const result = calculateDateRange(
        '2026-05-01',
        '2026-05-05',
        inclusive,
        events,
        coverage ? { 2026: coverage } : {},
      );
      expect(result).toEqual({
        naturalDays: 5,
        weekendDays: 2,
        workDays: 3,
        restDays: 2,
        estimated: true,
        missingYears: [2026],
      });
      expect(
        calculateDateRange(
          '2026-05-01',
          '2026-05-02',
          inclusive,
          events,
          coverage ? { 2026: coverage } : {},
        ).restDays,
      ).toBe(1);
      expect(
        calculateDateRange(
          '2026-05-02',
          '2026-05-02',
          inclusive,
          events,
          coverage ? { 2026: coverage } : {},
        ).workDays,
      ).toBe(0);
    },
  );

  it('跨年时只要任一年不完整，就连完整年份也不混用实际安排', () => {
    const crossYear = [holiday({ date: '2026-12-31', endDate: '2027-01-03', period: undefined })];
    const result = calculateDateRange('2026-12-31', '2027-01-02', inclusive, crossYear, {
      2026: 'complete',
      2027: 'partial',
    });
    expect(result).toEqual({
      naturalDays: 3,
      weekendDays: 1,
      workDays: 2,
      restDays: 1,
      estimated: true,
      missingYears: [2027],
    });
    expect(
      calculateDateRange('2026-12-31', '2027-01-02', inclusive, crossYear, {
        2026: 'complete',
        2027: 'complete',
      }).restDays,
    ).toBe(3);
  });

  it('年度覆盖只检查实际计入的日期，排除端点可消除缺失年份', () => {
    expect(
      calculateDateRange(
        '2025-12-31',
        '2026-01-01',
        { includeStart: false, includeEnd: true },
        [],
        complete,
      ).estimated,
    ).toBe(false);
    expect(
      calculateDateRange(
        '2026-12-31',
        '2027-01-01',
        { includeStart: true, includeEnd: false },
        [],
        complete,
      ).missingYears,
    ).toEqual([]);
    expect(
      calculateDateRange('2025-12-31', '2027-01-01', inclusive, [], complete).missingYears,
    ).toEqual([2025, 2027]);
  });

  it('常见节日不是自动休假', () => {
    expect(
      calculateDateRange(
        '2026-10-01',
        '2026-10-01',
        inclusive,
        [holiday({ type: 'holiday' })],
        complete,
      ).workDays,
    ).toBe(1);
  });

  it.each([
    ['2026-05-02', '2026-05-01'],
    ['2026-02-30', '2026-03-01'],
    ['1899-12-31', '1900-01-01'],
    ['2100-12-31', '2101-01-01'],
  ] as const)('无效区间 %s 至 %s 抛出异常', (start, end) => {
    expect(() => calculateDateRange(start, end, inclusive, [], {})).toThrow(RangeError);
  });

  it('跨夏令时仍按自然日和周末计数', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(calculateDateRange('2026-03-07', '2026-03-09', inclusive, [], complete)).toEqual({
      naturalDays: 3,
      weekendDays: 2,
      workDays: 1,
      restDays: 2,
      estimated: false,
      missingYears: [],
    });
    expect(
      calculateDateRange('2026-10-31', '2026-11-02', inclusive, [], complete).naturalDays,
    ).toBe(3);
  });
});

describe('农历互查与全年节气', () => {
  it('只返回实际农历年月份，包含负数闰月并排除库附带的上一年月份', () => {
    const months = getLunarMonths(2023);
    expect(
      LunarYear.fromYear(2023)
        .getMonths()
        .some((month) => month.getYear() !== 2023),
    ).toBe(true);
    expect(months).toHaveLength(13);
    expect(months.map((month) => month.month)).toEqual([1, 2, -2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(months[2]).toEqual({ month: -2, name: '闰二月', days: 29 });
    expect(getLunarMonths(2024)).toHaveLength(12);
    expect(months.reduce((total, month) => total + month.days, 0)).toBe(384);
  });

  it('支持真实闰月转换且按月份实际天数校验', () => {
    expect(convertLunarToSolar(2023, -2, 1)).toBe('2023-03-22');
    expect(convertLunarToSolar(2023, -2, 29)).toBe('2023-04-19');
    expect(convertLunarToSolar(2023, -2, 30)).toBeNull();
    expect(convertLunarToSolar(2024, -2, 1)).toBeNull();
    expect(convertLunarToSolar(2026, 1, 1)).toBe('2026-02-17');
    expect(convertLunarToSolar(2026, 0, 1)).toBeNull();
    expect(convertLunarToSolar(2026, 1, 0)).toBeNull();
    expect(convertLunarToSolar(2026, 1, 1.5)).toBeNull();
    expect(convertLunarToSolar(2026.5, 1, 1)).toBeNull();
  });

  it('以公历输出区间为准，允许 1900 年初对应的 1899 农历年', () => {
    expect(getLunarMonths(1899).length).toBeGreaterThanOrEqual(12);
    expect(convertLunarToSolar(1899, 12, 1)).toBe('1900-01-01');
    expect(convertLunarToSolar(1899, 1, 1)).toBeNull();
    expect(convertLunarToSolar(2100, 12, 1)).toBe('2100-12-31');
    expect(convertLunarToSolar(2100, 12, 2)).toBeNull();
    expect(getLunarMonths(1898)).toEqual([]);
    expect(getLunarMonths(2101)).toEqual([]);
    expect(getLunarMonths(Number.NaN)).toEqual([]);
  });

  it.each([1900, 2023, 2026, 2027, 2100])('%s 公历年恰有 24 个不重复节气且按四季分组', (year) => {
    const terms = getYearSolarTerms(year);
    expect(terms).toHaveLength(24);
    expect(new Set(terms.map((term) => term.name)).size).toBe(24);
    expect(terms.every((term) => term.date.startsWith(`${year}-`))).toBe(true);
    expect(terms.map((term) => term.date)).toEqual(terms.map((term) => term.date).sort());
    for (const season of ['春', '夏', '秋', '冬'])
      expect(terms.filter((term) => term.season === season)).toHaveLength(6);
    expect(terms[0].name).toBe('小寒');
    expect(terms[23].name).toBe('冬至');
  });

  it('正确处理节气表中的相邻年条目和英文冬至别名', () => {
    const terms = getYearSolarTerms(2026);
    expect(terms.find((term) => term.name === '冬至')).toEqual({
      name: '冬至',
      date: '2026-12-22',
      season: '冬',
    });
    expect(terms.find((term) => term.name === '白露')?.date).toBe('2026-09-07');
    expect(getYearSolarTerms(1899)).toEqual([]);
    expect(getYearSolarTerms(2101)).toEqual([]);
  });
});

describe('节日与实际假期倒计时', () => {
  it('最近节日包含今天，公农历节日按本地计算且不依赖放假源', () => {
    expect(getUpcomingFestival('2026-02-17')).toEqual({
      date: '2026-02-17',
      title: '春节',
      distance: 0,
    });
    expect(getUpcomingFestival('2026-02-16')).toEqual({
      date: '2026-02-16',
      title: '除夕',
      distance: 0,
    });
    expect(getUpcomingFestival('2026-04-05')).toEqual({
      date: '2026-04-05',
      title: '清明节',
      distance: 0,
    });
    expect(getUpcomingFestival('2026-12-31')).toEqual({
      date: '2027-01-01',
      title: '元旦节',
      distance: 1,
    });
    expect(getUpcomingFestival('2026-09-07')?.distance).toBeGreaterThan(0);
  });

  it('最近节日不越过支持范围，非法日期返回空结果', () => {
    expect(getUpcomingFestival('2100-12-31')).toBeNull();
    expect(getUpcomingFestival('2026-02-30')).toBeNull();
    expect(getUpcomingFestival('2101-01-01')).toBeNull();
  });

  it('假期倒计时仅认真实休假，忽略普通节日与补班事件', () => {
    expect(
      getHolidayCountdown('2026-09-07', [
        holiday({ type: 'holiday' }),
        holiday({ type: 'workday' }),
      ]),
    ).toBeNull();
    expect(getHolidayCountdown('2026-09-30', [holiday()])).toEqual({
      date: '2026-10-01',
      title: '国庆节',
      daysUntil: 1,
      remainingDays: 0,
      ongoing: false,
    });
  });

  it('主源假期以完整区间计算剩余天数，包含今天且结束日期不属于假期', () => {
    const events = [holiday({ id: 'third', date: '2026-10-03', endDate: undefined })];
    expect(getHolidayCountdown('2026-10-03', events)).toEqual({
      date: '2026-10-01',
      title: '国庆节',
      daysUntil: 0,
      remainingDays: 5,
      ongoing: true,
    });
    expect(getHolidayCountdown('2026-10-07', events)?.remainingDays).toBe(1);
    expect(getHolidayCountdown('2026-10-08', events)).toBeNull();
    expect(getHolidayCountdown('2026-02-30', events)).toBeNull();
  });

  it('备用单日记录不被推断成完整长假，但尊重明确给出的跨度', () => {
    const events = [
      holiday({ period: undefined, source: 'muhac', endDate: undefined }),
      holiday({ period: undefined, source: 'muhac', date: '2026-10-02', endDate: undefined }),
    ];
    expect(getHolidayCountdown('2026-10-01', events)?.remainingDays).toBe(1);
    expect(
      getHolidayCountdown('2026-10-01', [holiday({ period: undefined, source: 'muhac' })])
        ?.remainingDays,
    ).toBe(7);
  });

  it('跨年假期支持进行中状态，过期记录不会阻止选择下一段假期', () => {
    const newYear = holiday({
      id: 'new-year',
      title: '元旦',
      date: '2026-12-31',
      endDate: '2027-01-03',
      period: undefined,
    });
    expect(getHolidayCountdown('2026-12-01', [newYear, holiday()])?.date).toBe('2026-12-31');
    expect(getHolidayCountdown('2027-01-01', [newYear, holiday()])?.remainingDays).toBe(2);
    expect(getHolidayCountdown('2027-01-03', [newYear, holiday()])).toBeNull();
  });
});
