import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  clampDate,
  createLocalDate,
  dateDistance,
  formatCalendarTitle,
  formatDateKey,
  getCalendarDay,
  getDaySpecialItems,
  getDayTooltip,
  getIsoWeekNumber,
  getIsoWeekYear,
  getMonthGrid,
  getWeekDays,
  getYearMonths,
  indexDayStatuses,
  indexHolidays,
  isSupportedDate,
  MAX_CALENDAR_YEAR,
  MIN_CALENDAR_YEAR,
  normalizeDate,
  parseDateKey,
  shiftCalendarDate,
  startOfWeek,
} from '../calendar-date.util';
import { getLunarDateInfo, getLunarYearName } from '../lunar.service';
import type { CalendarBuildOptions, DateKey, HolidayEvent, HolidayPeriod } from '../types';

const emptyHolidays = new Map<DateKey, HolidayEvent[]>();
const period: HolidayPeriod = {
  id: 'national-2026',
  title: '国庆节',
  startDate: '2026-10-01',
  endDate: '2026-10-08',
  compDays: ['2026-10-10'],
  source: 'lanceliao',
};

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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('日期解析与导航', () => {
  it('公开支持区间，日期构造与规范化保留本地正午', () => {
    expect(MIN_CALENDAR_YEAR).toBe(1900);
    expect(MAX_CALENDAR_YEAR).toBe(2100);
    const original = new Date(2026, 8, 7, 23, 59);
    const normalized = normalizeDate(original);
    expect(formatDateKey(normalized)).toBe('2026-09-07');
    expect(normalized.getHours()).toBe(12);
    expect(original.getHours()).toBe(23);
    expect(formatDateKey(addDays(normalized, 1))).toBe('2026-09-08');
  });

  it.each(['1900-01-01', '2000-02-29', '2024-02-29', '2100-12-31'])(
    '严格解析有效日期 %s',
    (key) => {
      const parsed = parseDateKey(key);
      expect(parsed).not.toBeNull();
      expect(formatDateKey(parsed!)).toBe(key);
      expect(isSupportedDate(parsed!)).toBe(true);
    },
  );

  it.each([
    '1899-12-31',
    '2101-01-01',
    '1900-02-29',
    '2100-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '2026-9-07',
    '2026-09-7',
    ' 2026-09-07',
    '2026-09-07 ',
    '2026-09-07\n',
    '2026-09-07T00:00:00Z',
    'invalid',
    '',
  ])('拒绝无效、溢出或越界输入 %s', (key) => {
    expect(parseDateKey(key)).toBeNull();
  });

  it('越界截断到边界，非法 Date 不被替换成今天', () => {
    expect(formatDateKey(clampDate(createLocalDate(1899, 5, 1)))).toBe('1900-01-01');
    expect(formatDateKey(clampDate(createLocalDate(2101, 5, 1)))).toBe('2100-12-31');
    expect(isSupportedDate(new Date(Number.NaN))).toBe(false);
    expect(() => clampDate(new Date(Number.NaN))).toThrow(RangeError);
  });

  it.each([
    ['2024-02-29', 1, 'year', '2025-02-28'],
    ['2024-02-29', -1, 'year', '2023-02-28'],
    ['2024-01-31', 1, 'month', '2024-02-29'],
    ['2026-03-31', -1, 'month', '2026-02-28'],
    ['2026-12-31', 1, 'month', '2027-01-31'],
    ['2026-09-07', 1, 'week', '2026-09-14'],
    ['2026-12-31', 1, 'day', '2027-01-01'],
    ['1900-01-01', -1, 'day', '1900-01-01'],
    ['1900-01-31', -1, 'month', '1900-01-01'],
    ['2100-12-31', 1, 'year', '2100-12-31'],
    ['2100-12-31', 1, 'week', '2100-12-31'],
  ] as const)('%s 偏移 %s %s 得到 %s', (start, amount, unit, expected) => {
    const original = parseDateKey(start)!;
    expect(formatDateKey(shiftCalendarDate(original, amount, unit))).toBe(expected);
    expect(formatDateKey(original)).toBe(start);
  });

  it('拒绝非整数偏移并安全处理极大整数', () => {
    const date = parseDateKey('2026-09-07')!;
    expect(() => shiftCalendarDate(date, 1.5, 'day')).toThrow(RangeError);
    expect(() => shiftCalendarDate(date, Number.NaN, 'month')).toThrow(RangeError);
    expect(formatDateKey(shiftCalendarDate(date, Number.MAX_SAFE_INTEGER, 'day'))).toBe(
      '2100-12-31',
    );
    expect(formatDateKey(shiftCalendarDate(date, -Number.MAX_SAFE_INTEGER, 'year'))).toBe(
      '1900-01-01',
    );
  });

  it.each([
    ['America/New_York', '2026-03-07', '2026-03-09', 47],
    ['America/New_York', '2026-10-31', '2026-11-02', 49],
    ['Europe/Berlin', '2026-03-28', '2026-03-30', 47],
    ['Australia/Sydney', '2026-04-04', '2026-04-06', 49],
  ] as const)('%s %s 至 %s 跨 DST 按民用日期计数', (timezone, start, end, elapsedHours) => {
    vi.stubEnv('TZ', timezone);
    const startDate = parseDateKey(start)!;
    const endDate = parseDateKey(end)!;
    expect((endDate.getTime() - startDate.getTime()) / 3_600_000).toBe(elapsedHours);
    expect(dateDistance(start, end)).toBe(2);
    expect(dateDistance(end, start)).toBe(-2);
    expect(formatDateKey(shiftCalendarDate(startDate, 2, 'day'))).toBe(end);
  });

  it('距离函数允许排他结束日期越过支持上界，但不接受溢出日期', () => {
    expect(dateDistance('2100-12-31', '2101-01-01')).toBe(1);
    expect(() => dateDistance('2026-02-30', '2026-03-01')).toThrow(RangeError);
  });
});

describe('假期跨度与休班状态', () => {
  it('按排他结束日期展开，保留原始事件和假期区间', () => {
    const event = holiday();
    const index = indexHolidays([event]);
    expect(index.size).toBe(7);
    expect(index.get('2026-10-07')?.[0]).toBe(event);
    expect(index.get('2026-10-07')?.[0].date).toBe('2026-10-01');
    expect(index.get('2026-10-07')?.[0].period).toBe(period);
    expect(index.has('2026-10-08')).toBe(false);
    expect(indexDayStatuses([event]).get('2026-10-07')).toBe('dayoff');
  });

  it('支持跨年、无结束日期以及支持年份两端的区间', () => {
    expect([
      ...indexHolidays([holiday({ date: '2026-12-31', endDate: '2027-01-03' })]).keys(),
    ]).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
    expect(indexHolidays([holiday({ endDate: undefined })]).size).toBe(1);
    expect([
      ...indexHolidays([holiday({ date: '1899-12-31', endDate: '1900-01-02' })]).keys(),
    ]).toEqual(['1900-01-01']);
    expect([
      ...indexHolidays([holiday({ date: '2100-12-31', endDate: '2101-01-02' })]).keys(),
    ]).toEqual(['2100-12-31']);
  });

  it.each([
    { date: '2026-02-30', endDate: '2026-03-02' },
    { date: '2026-10-01', endDate: '2026-10-01' },
    { date: '2026-10-01', endDate: '2026-09-30' },
    { date: '2026-10-01', endDate: '2026-10-32' },
  ] satisfies Partial<HolidayEvent>[])(
    '忽略无效区间而不伪造一天休假 $date $endDate',
    (overrides) => {
      expect(indexHolidays([holiday(overrides)]).size).toBe(0);
      expect(indexDayStatuses([holiday(overrides)]).size).toBe(0);
    },
  );

  it('同类重复去重，但节日与实际放假保留各自语义', () => {
    const events = [
      holiday({ type: 'holiday', period: undefined }),
      holiday({ id: 'duplicate', type: 'holiday', title: '国庆节（中国）', period: undefined }),
      holiday(),
    ];
    expect(indexHolidays(events).get('2026-10-01')).toHaveLength(2);
    expect(
      indexHolidays(events)
        .get('2026-10-01')
        ?.map((item) => item.type),
    ).toEqual(['holiday', 'dayoff']);
    expect(indexDayStatuses(events.slice(0, 2)).size).toBe(0);
  });

  it('显式补班覆盖周末与重复休息标记，不依赖事件顺序', () => {
    const rest = holiday({ date: '2026-10-10', endDate: undefined });
    const work = holiday({ date: '2026-10-10', endDate: undefined, type: 'workday' });
    for (const events of [
      [rest, work],
      [work, rest],
    ]) {
      const statuses = indexDayStatuses(events);
      const day = getCalendarDay(parseDateKey('2026-10-10')!, indexHolidays(events), statuses);
      expect(statuses.get('2026-10-10')).toBe('workday');
      expect(day.isWeekend).toBe(true);
      expect(day.dayStatus).toBe('workday');
      expect(getDaySpecialItems(day).some((item) => item.tone === 'dayoff')).toBe(false);
    }
    expect(getCalendarDay(parseDateKey('2026-10-11')!, emptyHolidays).dayStatus).toBeUndefined();
  });

  it('去重优先保留含原始区间的事件，不被较长的无区间标题覆盖', () => {
    const events = [holiday(), holiday({ title: '国庆节（放假）', period: undefined })];
    expect(indexHolidays(events).get('2026-10-03')?.[0].period).toBe(period);
  });

  it('假期范围内的显式补班不展示休假第 N 天', () => {
    const events = [
      holiday(),
      holiday({ date: '2026-10-03', endDate: undefined, type: 'workday' }),
    ];
    const day = getCalendarDay(
      parseDateKey('2026-10-03')!,
      indexHolidays(events),
      indexDayStatuses(events),
    );
    expect(getDayTooltip(day)).toContain('调休上班');
    expect(getDayTooltip(day)).not.toMatch(/第 \d+ 天/);
  });
});

describe('日历布局、今天与 ISO 周', () => {
  it('周一是默认起点，周日起点不改变星期标签或周末含义', () => {
    const date = parseDateKey('2026-09-09')!;
    expect(formatDateKey(startOfWeek(date))).toBe('2026-09-07');
    expect(formatDateKey(startOfWeek(date, 0))).toBe('2026-09-06');
    const days = getWeekDays(date, emptyHolidays, undefined, { weekStartsOn: 0 });
    expect(days[0]).toMatchObject({
      key: '2026-09-06',
      weekday: 6,
      weekdayText: '星期日',
      isWeekend: true,
    });
    expect(days[1]).toMatchObject({ weekday: 0, weekdayText: '星期一', isWeekend: false });
  });

  it('月与年视图透传布局选项，旧签名仍可用', () => {
    expect(getMonthGrid(2026, 1, emptyHolidays)).toHaveLength(35);
    expect(getMonthGrid(2026, 1, emptyHolidays, true)).toHaveLength(42);
    const days = getMonthGrid(2026, 1, emptyHolidays, false, undefined, { weekStartsOn: 0 });
    expect(days[0]).toMatchObject({ key: '2026-02-01', weekday: 6, isCurrentMonth: true });
    const months = getYearMonths(2026, emptyHolidays, undefined, {
      weekStartsOn: 0,
      todayKey: '2026-02-17',
    });
    expect(months).toHaveLength(12);
    expect(months.every((month) => month.days.length === 42 && month.days[0].weekday === 6)).toBe(
      true,
    );
    expect(months[1].days.find((day) => day.key === '2026-02-17')?.isToday).toBe(true);
  });

  it('支持边界月份补齐网格，不把相邻日截断为重复日期', () => {
    const first = getMonthGrid(1900, 0, emptyHolidays, true, undefined, { weekStartsOn: 0 });
    const last = getMonthGrid(2100, 11, emptyHolidays, true);
    expect(first[0].key).toBe('1899-12-31');
    expect(first[0].isCurrentMonth).toBe(false);
    expect(last.some((day) => day.year === 2101)).toBe(true);
    expect(new Set(first.map((day) => day.key)).size).toBe(42);
    expect(new Set(last.map((day) => day.key)).size).toBe(42);
  });

  it('今天使用调用方传入的响应式日期快照，可跨午夜刷新', () => {
    const options: CalendarBuildOptions = { todayKey: '2026-09-07' };
    const date = parseDateKey('2026-09-07')!;
    expect(getCalendarDay(date, emptyHolidays, undefined, options).isToday).toBe(true);
    options.todayKey = '2026-09-08';
    expect(getCalendarDay(date, emptyHolidays, undefined, options).isToday).toBe(false);
    expect(
      getWeekDays(date, emptyHolidays, undefined, options).find((day) => day.isToday)?.key,
    ).toBe('2026-09-08');
  });

  it('未传 todayKey 时保留系统时间默认值', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 7, 23, 59));
    const date = parseDateKey('2026-09-07')!;
    expect(getCalendarDay(date, emptyHolidays).isToday).toBe(true);
    vi.setSystemTime(new Date(2026, 8, 8, 0, 1));
    expect(getCalendarDay(date, emptyHolidays).isToday).toBe(false);
  });

  it.each([
    ['2021-01-01', 2020, 53],
    ['2024-12-30', 2025, 1],
    ['2026-09-07', 2026, 37],
    ['2027-01-01', 2026, 53],
  ] as const)('%s 的 ISO 周属于 %s 年第 %s 周', (key, year, week) => {
    const date = parseDateKey(key)!;
    expect(getIsoWeekYear(date)).toBe(year);
    expect(getIsoWeekNumber(date)).toBe(week);
  });

  it('标题按配置显示周范围，跨年周标注 ISO 周所属年份', () => {
    const date = parseDateKey('2024-12-30')!;
    expect(formatCalendarTitle(date, 'week')).toBe(
      '2024 年 12 月 30 日 – 2025 年 1 月 5 日（2025 年 第 1 周）',
    );
    expect(formatCalendarTitle(date, 'week', { showWeekNumbers: false })).not.toContain('周');
    expect(formatCalendarTitle(date, 'week', { weekStartsOn: 0, showWeekNumbers: true })).toBe(
      '2024 年 12 月 29 日 – 2025 年 1 月 4 日',
    );
    expect(formatCalendarTitle(parseDateKey('2026-09-07')!, 'year')).toBe('2026 - 丙午马年');
    expect(formatCalendarTitle(date, 'month')).toBe('2024 年 12 月');
    expect(formatCalendarTitle(date, 'day')).toBe('2024 年 12 月 30 日');
  });
});

describe('本地节日、节气与假期说明', () => {
  it('使用实际历法库计算公历和农历常见节日', () => {
    expect(getLunarDateInfo(2026, 2, 17).festivals).toContain('春节');
    expect(getLunarDateInfo(2026, 2, 16).festivals).toContain('除夕');
    expect(getLunarDateInfo(2026, 5, 1).festivals).toContain('劳动节');
    expect(getLunarDateInfo(2026, 5, 10).festivals).toContain('母亲节');
    expect(getLunarDateInfo(2026, 4, 5).festivals).toContain('清明节');
    expect(getLunarYearName(2026)).toBe('丙午马年');
    expect(getLunarDateInfo(2023, 3, 22).lunarMonth).toBe('闰二月');
  });

  it('合并本地和远程节日，但明确区分当天节日与多日假期', () => {
    const events = [holiday(), holiday({ id: 'festival', type: 'holiday', endDate: undefined })];
    const index = indexHolidays(events);
    const statuses = indexDayStatuses(events);
    const first = getDaySpecialItems(getCalendarDay(parseDateKey('2026-10-01')!, index, statuses));
    expect(first.filter((item) => item.tone === 'holiday' && item.title === '国庆节')).toHaveLength(
      1,
    );
    expect(first.some((item) => item.tone === 'dayoff' && item.title === '国庆节假期')).toBe(true);
    const third = getDaySpecialItems(getCalendarDay(parseDateKey('2026-10-03')!, index, statuses));
    expect(third.some((item) => item.tone === 'dayoff')).toBe(true);
    expect(third.some((item) => item.tone === 'holiday' && item.title === '国庆节')).toBe(false);
  });

  it('本地清明节与节气去重，显示开关只隐藏节气', () => {
    const qingming = getCalendarDay(parseDateKey('2026-04-05')!, emptyHolidays);
    expect(
      getDaySpecialItems(qingming).filter((item) => item.title.startsWith('清明')),
    ).toHaveLength(1);
    expect(
      getDaySpecialItems(qingming, { showSolarTerms: false }).some(
        (item) => item.title === '清明节',
      ),
    ).toBe(true);
    const bailu = getCalendarDay(parseDateKey('2026-09-07')!, emptyHolidays);
    expect(
      getDaySpecialItems(bailu).some((item) => item.title === '白露' && item.tone === 'solar-term'),
    ).toBe(true);
    expect(
      getDaySpecialItems(bailu, { showSolarTerms: false }).some((item) => item.title === '白露'),
    ).toBe(false);
  });

  it('无远程文案时仍展示显式休班状态', () => {
    const day = getCalendarDay(
      parseDateKey('2026-09-07')!,
      emptyHolidays,
      new Map([['2026-09-07', 'workday']]),
    );
    expect(getDaySpecialItems(day)).toContainEqual({
      id: '2026-09-07-workday',
      title: '调休上班',
      tone: 'workday',
    });
  });

  it('多日假期 tooltip 展示第 N 天、总天数、区间及关联补班', () => {
    const events = [holiday()];
    const tooltip = getDayTooltip(
      getCalendarDay(parseDateKey('2026-10-03')!, indexHolidays(events), indexDayStatuses(events)),
    );
    expect(tooltip).toContain('休息日');
    expect(tooltip).toContain('2026-10-01 至 2026-10-07');
    expect(tooltip).toContain('第 3 天 / 共 7 天');
    expect(tooltip).toContain('调休上班：2026-10-10');
  });

  it('补班 tooltip 展示关联假期但不将补班日期计为假期第 N 天', () => {
    const events = [holiday({ date: '2026-10-10', endDate: undefined, type: 'workday' })];
    const tooltip = getDayTooltip(
      getCalendarDay(parseDateKey('2026-10-10')!, indexHolidays(events), indexDayStatuses(events)),
    );
    expect(tooltip).toContain('调休上班');
    expect(tooltip).toContain('2026-10-01 至 2026-10-07');
    expect(tooltip).not.toContain('第 10 天');
  });

  it('农历日缓存有界，超出容量后重新计算仍保持正确结果', () => {
    const first = getLunarDateInfo(2001, 1, 1);
    expect(getLunarDateInfo(2001, 1, 1)).toBe(first);
    const start = createLocalDate(2002, 0, 1);
    for (let offset = 0; offset < 805; offset += 1) {
      const date = addDays(start, offset);
      getLunarDateInfo(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }
    const refreshed = getLunarDateInfo(2001, 1, 1);
    expect(refreshed).not.toBe(first);
    expect(refreshed).toEqual(first);
  });
});
