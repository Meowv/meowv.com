import { getLunarDateInfo, getLunarYearName } from './lunar.service';
import type {
  CalendarBuildOptions,
  CalendarDay,
  CalendarDayStatus,
  CalendarMonth,
  CalendarSpecialItem,
  DateKey,
  HolidayEvent,
} from './types';

const EMPTY_DAY_STATUS_INDEX = new Map<DateKey, CalendarDayStatus>();
const MILLISECONDS_PER_DAY = 86_400_000;

export const MIN_CALENDAR_YEAR = 1900;
export const MAX_CALENDAR_YEAR = 2100;

export const WEEKDAY_SHORT = ['一', '二', '三', '四', '五', '六', '日'] as const;
export const WEEKDAY_LONG = [
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
  '星期日',
] as const;

export function createLocalDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  date.setFullYear(year, monthIndex, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function normalizeDate(date: Date): Date {
  return createLocalDate(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function addDays(date: Date, amount: number): Date {
  return createLocalDate(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  return addDays(date, -((date.getDay() - weekStartsOn + 7) % 7));
}

function parseCivilDate(value: string): Date | null {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = createLocalDate(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function isSupportedDate(date: Date): boolean {
  return (
    Number.isFinite(date.getTime()) &&
    date.getFullYear() >= MIN_CALENDAR_YEAR &&
    date.getFullYear() <= MAX_CALENDAR_YEAR
  );
}

export function parseDateKey(value: string): Date | null {
  const date = parseCivilDate(value);
  return date && isSupportedDate(date) ? date : null;
}

export function clampDate(date: Date): Date {
  if (!Number.isFinite(date.getTime())) throw new RangeError('无效日期');
  if (date.getFullYear() < MIN_CALENDAR_YEAR) return createLocalDate(MIN_CALENDAR_YEAR, 0, 1);
  if (date.getFullYear() > MAX_CALENDAR_YEAR) return createLocalDate(MAX_CALENDAR_YEAR, 11, 31);
  return normalizeDate(date);
}

export function shiftCalendarDate(
  date: Date,
  amount: number,
  unit: 'year' | 'month' | 'week' | 'day',
): Date {
  if (!Number.isSafeInteger(amount)) throw new RangeError('日期偏移量必须为整数');
  const current = clampDate(date);
  if (unit === 'day' || unit === 'week') {
    const offset = amount * (unit === 'week' ? 7 : 1);
    const minimum = createLocalDate(MIN_CALENDAR_YEAR, 0, 1);
    const maximum = createLocalDate(MAX_CALENDAR_YEAR, 11, 31);
    if (offset <= dateDistance(formatDateKey(current), formatDateKey(minimum))) return minimum;
    if (offset >= dateDistance(formatDateKey(current), formatDateKey(maximum))) return maximum;
    return addDays(current, offset);
  }

  const monthOffset =
    current.getFullYear() * 12 + current.getMonth() + amount * (unit === 'year' ? 12 : 1);
  if (monthOffset < MIN_CALENDAR_YEAR * 12) return createLocalDate(MIN_CALENDAR_YEAR, 0, 1);
  if (monthOffset > MAX_CALENDAR_YEAR * 12 + 11) return createLocalDate(MAX_CALENDAR_YEAR, 11, 31);
  const year = Math.floor(monthOffset / 12);
  const month = monthOffset % 12;
  const day = Math.min(current.getDate(), createLocalDate(year, month + 1, 0).getDate());
  return createLocalDate(year, month, day);
}

export function dateDistance(startKey: DateKey, endKey: DateKey): number {
  const start = parseCivilDate(startKey);
  const end = parseCivilDate(endKey);
  if (!start || !end) throw new RangeError('无效日期');
  const civilTime = (date: Date) => {
    const utc = new Date(0);
    utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    return utc.getTime();
  };
  return (civilTime(end) - civilTime(start)) / MILLISECONDS_PER_DAY;
}

function getHolidayBaseTitle(title: string): string {
  return title.replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim();
}

function dedupeHolidayEvents(events: readonly HolidayEvent[]): HolidayEvent[] {
  const unique = new Map<string, HolidayEvent>();
  for (const event of events) {
    const key = `${event.type}:${getHolidayBaseTitle(event.title)}`;
    const previous = unique.get(key);
    if (
      !previous ||
      (!previous.period && event.period) ||
      (Boolean(previous.period) === Boolean(event.period) &&
        event.title.length > previous.title.length)
    ) {
      unique.set(key, event);
    }
  }
  return [...unique.values()];
}

function getEventDates(event: HolidayEvent): DateKey[] {
  const start = parseCivilDate(event.date);
  const end = event.endDate ? parseCivilDate(event.endDate) : start && addDays(start, 1);
  if (!start || !end || end <= start) return [];
  const dates: DateKey[] = [];
  const first =
    start.getFullYear() < MIN_CALENDAR_YEAR ? createLocalDate(MIN_CALENDAR_YEAR, 0, 1) : start;
  for (
    let current = first;
    current < end && isSupportedDate(current);
    current = addDays(current, 1)
  ) {
    dates.push(formatDateKey(current));
  }
  return dates;
}

export function indexHolidays(events: readonly HolidayEvent[]): Map<DateKey, HolidayEvent[]> {
  const index = new Map<DateKey, HolidayEvent[]>();
  for (const event of events) {
    for (const date of getEventDates(event)) {
      const items = index.get(date) ?? [];
      items.push(event);
      index.set(date, items);
    }
  }
  for (const [date, items] of index) index.set(date, dedupeHolidayEvents(items));
  return index;
}

export function indexDayStatuses(events: readonly HolidayEvent[]): Map<DateKey, CalendarDayStatus> {
  const index = new Map<DateKey, CalendarDayStatus>();

  for (const event of events) {
    if (event.type !== 'dayoff' && event.type !== 'workday') continue;

    for (const key of getEventDates(event)) {
      if (index.get(key) !== 'workday') index.set(key, event.type);
    }
  }

  return index;
}

function buildCalendarDay(
  date: Date,
  currentMonth: number,
  holidayIndex: ReadonlyMap<DateKey, HolidayEvent[]>,
  dayStatusIndex: ReadonlyMap<DateKey, CalendarDayStatus>,
  options: CalendarBuildOptions,
): CalendarDay {
  const normalized = normalizeDate(date);
  const key = formatDateKey(normalized);
  const weekday = (normalized.getDay() + 6) % 7;
  const todayKey = options.todayKey ?? formatDateKey(new Date());

  return {
    key,
    date: normalized,
    year: normalized.getFullYear(),
    month: normalized.getMonth() + 1,
    day: normalized.getDate(),
    weekday,
    weekdayText: WEEKDAY_LONG[weekday],
    isToday: key === todayKey,
    isWeekend: weekday >= 5,
    isCurrentMonth: normalized.getMonth() === currentMonth,
    dayStatus: dayStatusIndex.get(key),
    lunar: getLunarDateInfo(
      normalized.getFullYear(),
      normalized.getMonth() + 1,
      normalized.getDate(),
    ),
    holidays: holidayIndex.get(key) ?? [],
  };
}

export function getMonthGrid(
  year: number,
  monthIndex: number,
  holidayIndex: ReadonlyMap<DateKey, HolidayEvent[]>,
  fixedWeekCount = false,
  dayStatusIndex: ReadonlyMap<DateKey, CalendarDayStatus> = EMPTY_DAY_STATUS_INDEX,
  options: CalendarBuildOptions = {},
): CalendarDay[] {
  const firstDay = createLocalDate(year, monthIndex, 1);
  const leadingDays = (firstDay.getDay() - (options.weekStartsOn ?? 1) + 7) % 7;
  const daysInMonth = createLocalDate(year, monthIndex + 1, 0).getDate();
  const cellCount = fixedWeekCount || leadingDays + daysInMonth > 35 ? 42 : 35;
  const gridStart = addDays(firstDay, -leadingDays);

  return Array.from({ length: cellCount }, (_, index) =>
    buildCalendarDay(addDays(gridStart, index), monthIndex, holidayIndex, dayStatusIndex, options),
  );
}

export function getWeekDays(
  date: Date,
  holidayIndex: ReadonlyMap<DateKey, HolidayEvent[]>,
  dayStatusIndex: ReadonlyMap<DateKey, CalendarDayStatus> = EMPTY_DAY_STATUS_INDEX,
  options: CalendarBuildOptions = {},
): CalendarDay[] {
  const firstDay = startOfWeek(date, options.weekStartsOn);
  return Array.from({ length: 7 }, (_, index) => {
    const current = addDays(firstDay, index);
    return buildCalendarDay(current, current.getMonth(), holidayIndex, dayStatusIndex, options);
  });
}

export function getCalendarDay(
  date: Date,
  holidayIndex: ReadonlyMap<DateKey, HolidayEvent[]>,
  dayStatusIndex: ReadonlyMap<DateKey, CalendarDayStatus> = EMPTY_DAY_STATUS_INDEX,
  options: CalendarBuildOptions = {},
): CalendarDay {
  return buildCalendarDay(date, date.getMonth(), holidayIndex, dayStatusIndex, options);
}

export function getYearMonths(
  year: number,
  holidayIndex: ReadonlyMap<DateKey, HolidayEvent[]>,
  dayStatusIndex: ReadonlyMap<DateKey, CalendarDayStatus> = EMPTY_DAY_STATUS_INDEX,
  options: CalendarBuildOptions = {},
): CalendarMonth[] {
  return Array.from({ length: 12 }, (_, month) => ({
    year,
    month: month + 1,
    days: getMonthGrid(year, month, holidayIndex, true, dayStatusIndex, options),
  }));
}

export function getDaySpecialItems(
  day: CalendarDay,
  options: { showSolarTerms?: boolean } = {},
): CalendarSpecialItem[] {
  const items = new Map<string, CalendarSpecialItem>();
  const baseTitle = (title: string) => getHolidayBaseTitle(title).replace(/节$/, '');
  for (const event of day.holidays) {
    const tone = event.type === 'dayoff' || event.type === 'workday' ? event.type : 'holiday';
    if (day.dayStatus && tone !== 'holiday' && tone !== day.dayStatus) continue;
    let title = event.title;
    if (tone === 'dayoff' && !/假期|放假|休息/.test(title)) title = `${title}假期`;
    if (tone === 'workday' && !/调休|上班|补班/.test(title)) title = `${title} · 调休上班`;
    items.set(`${tone}:${baseTitle(event.title)}`, { id: event.id, title, tone });
  }
  for (const festival of day.lunar.festivals) {
    const key = `holiday:${baseTitle(festival)}`;
    if (!items.has(key))
      items.set(key, { id: `${day.key}-${key}`, title: festival, tone: 'holiday' });
  }
  if (day.dayStatus && ![...items.values()].some((item) => item.tone === day.dayStatus)) {
    items.set(day.dayStatus, {
      id: `${day.key}-${day.dayStatus}`,
      title: day.dayStatus === 'workday' ? '调休上班' : '休息日',
      tone: day.dayStatus,
    });
  }
  const solarTerm = options.showSolarTerms === false ? undefined : day.lunar.solarTerm;
  if (solarTerm && !items.has(`holiday:${baseTitle(solarTerm)}`)) {
    items.set('solar-term', {
      id: `${day.key}-solar-term`,
      title: solarTerm,
      tone: 'solar-term',
    });
  }
  return [...items.values()];
}

function formatDatePart(date: Date, includeYear: boolean): string {
  return `${includeYear ? `${date.getFullYear()} 年 ` : ''}${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function getIsoWeekThursday(date: Date): Date {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - weekday);
  return target;
}

export function getIsoWeekYear(date: Date): number {
  return getIsoWeekThursday(date).getUTCFullYear();
}

export function getIsoWeekNumber(date: Date): number {
  const target = getIsoWeekThursday(date);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(
    (target.getTime() - yearStart.getTime() + MILLISECONDS_PER_DAY) / (7 * MILLISECONDS_PER_DAY),
  );
}

export function formatCalendarTitle(
  date: Date,
  view: 'year' | 'month' | 'week' | 'day',
  options: { weekStartsOn?: 0 | 1; showWeekNumbers?: boolean } = {},
): string {
  if (view === 'year') return `${date.getFullYear()} - ${getLunarYearName(date.getFullYear())}`;
  if (view === 'month') return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
  if (view === 'day') {
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }

  const start = startOfWeek(date, options.weekStartsOn);
  const end = addDays(start, 6);
  const sameYear = start.getFullYear() === end.getFullYear();
  const range = `${formatDatePart(start, true)} – ${formatDatePart(end, !sameYear)}`;
  if (options.weekStartsOn === 0 || options.showWeekNumbers === false) return range;
  const weekYear = getIsoWeekYear(start);
  const yearLabel = !sameYear || weekYear !== start.getFullYear() ? `${weekYear} 年 ` : '';
  return `${range}（${yearLabel}第 ${getIsoWeekNumber(start)} 周）`;
}

export function getDayTooltip(day: CalendarDay): string {
  const details = [
    `${day.year} 年 ${day.month} 月 ${day.day} 日 ${day.weekdayText}`,
    `农历 ${day.lunar.lunarMonth}${day.lunar.lunarDay}`,
  ];
  if (day.dayStatus) details.push(day.dayStatus === 'dayoff' ? '休息日' : '调休上班');
  details.push(...getDaySpecialItems(day).map((item) => item.title));
  const periods = new Set<string>();
  for (const event of day.holidays) {
    const period = event.period;
    if (!period || periods.has(period.id)) continue;
    periods.add(period.id);
    try {
      const total = dateDistance(period.startDate, period.endDate);
      if (total <= 0) continue;
      const position = dateDistance(period.startDate, day.key) + 1;
      const end = parseCivilDate(period.endDate);
      if (!end) continue;
      const title = period.title.endsWith('假期') ? period.title : `${period.title}假期`;
      details.push(`${title}：${period.startDate} 至 ${formatDateKey(addDays(end, -1))}`);
      if (
        event.type === 'dayoff' &&
        day.dayStatus !== 'workday' &&
        position > 0 &&
        position <= total
      ) {
        details.push(`第 ${position} 天 / 共 ${total} 天`);
      }
      if (period.compDays.length) details.push(`调休上班：${period.compDays.join('、')}`);
    } catch {
      continue;
    }
  }
  return [...new Set(details)].join('\n');
}
