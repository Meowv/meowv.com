import { Lunar, LunarYear, Solar } from 'lunar-javascript';
import {
  addDays,
  dateDistance,
  formatDateKey,
  indexDayStatuses,
  isSupportedDate,
  MAX_CALENDAR_YEAR,
  MIN_CALENDAR_YEAR,
  parseDateKey,
} from './calendar-date.util';
import { getLunarDateInfo } from './lunar.service';
import type { CalendarCoverage, DateKey, HolidayEvent, HolidayPeriod } from './types';

export function getHolidayPeriods(events: readonly HolidayEvent[]): HolidayPeriod[] {
  const periods = new Map<string, HolidayPeriod>();
  for (const event of events) {
    if (!event.period && event.type !== 'dayoff') continue;
    const start = parseDateKey(event.date);
    if (!event.period && !start) continue;
    const period = event.period ?? {
      id: event.id,
      title: event.title,
      startDate: event.date,
      endDate: event.endDate ?? formatDateKey(addDays(start!, 1)),
      compDays: [],
      source: event.source,
    };
    try {
      if (dateDistance(period.startDate, period.endDate) <= 0) continue;
    } catch {
      continue;
    }
    const key = `${period.source}:${period.startDate}:${period.endDate}:${period.title}`;
    const previous = periods.get(key);
    periods.set(key, {
      ...period,
      compDays: [...new Set([...(previous?.compDays ?? []), ...period.compDays])]
        .filter((date) => parseDateKey(date) !== null)
        .sort(),
    });
  }
  return [...periods.values()].sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) || left.title.localeCompare(right.title),
  );
}

export function calculateDateRange(
  start: DateKey,
  end: DateKey,
  options: { includeStart: boolean; includeEnd: boolean },
  events: readonly HolidayEvent[],
  coverage: Record<number, CalendarCoverage>,
): {
  naturalDays: number;
  weekendDays: number;
  workDays: number;
  restDays: number;
  estimated: boolean;
  missingYears: number[];
} {
  const startDate = parseDateKey(start);
  const endDate = parseDateKey(end);
  if (!startDate || !endDate || startDate > endDate) throw new RangeError('请输入有效的起止日期');
  const first = addDays(startDate, options.includeStart ? 0 : 1);
  const last = addDays(endDate, options.includeEnd ? 0 : -1);
  const naturalDays = Math.max(0, dateDistance(formatDateKey(first), formatDateKey(last)) + 1);
  const missingYears: number[] = [];
  if (naturalDays > 0) {
    for (let year = first.getFullYear(); year <= last.getFullYear(); year += 1) {
      if (coverage[year] !== 'complete') missingYears.push(year);
    }
  }
  const estimated = missingYears.length > 0;
  const statuses = estimated || naturalDays === 0 ? new Map() : indexDayStatuses(events);
  let weekendDays = 0;
  let restDays = 0;
  for (let offset = 0; offset < naturalDays; offset += 1) {
    const date = addDays(first, offset);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const status = statuses.get(formatDateKey(date));
    if (weekend) weekendDays += 1;
    if (status === 'dayoff' || (status !== 'workday' && weekend)) restDays += 1;
  }
  return {
    naturalDays,
    weekendDays,
    workDays: naturalDays - restDays,
    restDays,
    estimated,
    missingYears,
  };
}

export function getLunarMonths(year: number): { month: number; name: string; days: number }[] {
  if (!Number.isInteger(year) || year < MIN_CALENDAR_YEAR - 1 || year > MAX_CALENDAR_YEAR)
    return [];
  return LunarYear.fromYear(year)
    .getMonthsInYear()
    .map((month) => ({
      month: month.getMonth(),
      name: `${Lunar.fromYmd(year, month.getMonth(), 1).getMonthInChinese()}月`,
      days: month.getDayCount(),
    }));
}

export function convertLunarToSolar(year: number, month: number, day: number): DateKey | null {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  const lunarMonth = getLunarMonths(year).find((item) => item.month === month);
  if (!lunarMonth || day < 1 || day > lunarMonth.days) return null;
  const solar = Lunar.fromYmd(year, month, day).getSolar();
  const date = parseDateKey(solar.toYmd());
  return date ? formatDateKey(date) : null;
}

const SOLAR_TERM_SEASONS = {
  立春: '春',
  雨水: '春',
  惊蛰: '春',
  春分: '春',
  清明: '春',
  谷雨: '春',
  立夏: '夏',
  小满: '夏',
  芒种: '夏',
  夏至: '夏',
  小暑: '夏',
  大暑: '夏',
  立秋: '秋',
  处暑: '秋',
  白露: '秋',
  秋分: '秋',
  寒露: '秋',
  霜降: '秋',
  立冬: '冬',
  小雪: '冬',
  大雪: '冬',
  冬至: '冬',
  小寒: '冬',
  大寒: '冬',
} as const;

export function getYearSolarTerms(
  year: number,
): { name: string; date: DateKey; season: '春' | '夏' | '秋' | '冬' }[] {
  if (!Number.isInteger(year) || year < MIN_CALENDAR_YEAR || year > MAX_CALENDAR_YEAR) return [];
  const terms = new Map<
    string,
    { name: string; date: DateKey; season: '春' | '夏' | '秋' | '冬' }
  >();
  const table = Solar.fromYmd(year, 7, 1).getLunar().getJieQiTable();
  for (const solar of Object.values(table)) {
    if (solar.getYear() !== year) continue;
    const name = solar.getLunar().getJieQi();
    const season = SOLAR_TERM_SEASONS[name as keyof typeof SOLAR_TERM_SEASONS];
    const date = parseDateKey(solar.toYmd());
    if (season && date) terms.set(name, { name, date: formatDateKey(date), season });
  }
  return [...terms.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function getUpcomingFestival(
  today: DateKey,
): { date: DateKey; title: string; distance: number } | null {
  const start = parseDateKey(today);
  if (!start) return null;
  for (let distance = 0; distance < 366; distance += 1) {
    const date = addDays(start, distance);
    if (!isSupportedDate(date)) break;
    const { festivals } = getLunarDateInfo(date.getFullYear(), date.getMonth() + 1, date.getDate());
    if (festivals.length)
      return { date: formatDateKey(date), title: festivals.join(' · '), distance };
  }
  return null;
}

export function getHolidayCountdown(
  today: DateKey,
  events: readonly HolidayEvent[],
): {
  date: DateKey;
  title: string;
  daysUntil: number;
  remainingDays: number;
  ongoing: boolean;
} | null {
  if (!parseDateKey(today)) return null;
  const candidates = events
    .flatMap((event) => {
      if (event.type !== 'dayoff') return [];
      const date = parseDateKey(event.date);
      if (!date) return [];
      let startDate = event.date;
      let endDate = event.endDate ?? formatDateKey(addDays(date, 1));
      try {
        if (dateDistance(startDate, endDate) <= 0) return [];
        if (event.period) {
          if (dateDistance(event.period.startDate, event.period.endDate) <= 0) return [];
          const firstYearStart = `${date.getFullYear()}-01-01` as DateKey;
          const endYear = Number(endDate.slice(0, 4)) + (endDate.endsWith('-01-01') ? 0 : 1);
          const lastYearEnd = `${endYear}-01-01` as DateKey;
          startDate =
            event.period.startDate > firstYearStart ? event.period.startDate : firstYearStart;
          endDate = event.period.endDate < lastYearEnd ? event.period.endDate : lastYearEnd;
        }
      } catch {
        return [];
      }
      if (endDate <= today || endDate <= startDate) return [];
      return [{ event, startDate, endDate, effectiveStart: startDate < today ? today : startDate }];
    })
    .sort((left, right) => left.effectiveStart.localeCompare(right.effectiveStart));
  const selected = candidates[0];
  if (!selected) return null;
  const { event, endDate } = selected;
  const ongoing = selected.startDate <= today;
  const startDate = ongoing ? (event.period?.startDate ?? selected.startDate) : selected.startDate;
  return {
    date: startDate,
    title: event.period?.title ?? event.title,
    daysUntil: ongoing ? 0 : dateDistance(today, startDate),
    remainingDays: ongoing ? dateDistance(today, event.period?.endDate ?? endDate) : 0,
    ongoing,
  };
}
