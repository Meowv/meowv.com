import { getLunarDateInfo, getLunarYearName } from './lunar.service';
import type {
  CalendarDay,
  CalendarDayStatus,
  CalendarMonth,
  CalendarSpecialItem,
  DateKey,
  HolidayEvent,
} from './types';

const EMPTY_DAY_STATUS_INDEX = new Map<DateKey, CalendarDayStatus>();

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
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
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

export function startOfWeek(date: Date): Date {
  const mondayOffset = (date.getDay() + 6) % 7;
  return addDays(date, -mondayOffset);
}

function getHolidayBaseTitle(title: string): string {
  return title.replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim();
}

function dedupeHolidayEvents(events: readonly HolidayEvent[]): HolidayEvent[] {
  const latestByTitle = new Map<string, HolidayEvent>();
  for (const event of events) latestByTitle.set(event.title, event);

  const uniqueEvents = [...latestByTitle.values()];
  const decoratedTitles = new Set(
    uniqueEvents
      .filter((event) => getHolidayBaseTitle(event.title) !== event.title)
      .map((event) => getHolidayBaseTitle(event.title)),
  );

  return uniqueEvents.filter(
    (event) =>
      getHolidayBaseTitle(event.title) !== event.title ||
      !decoratedTitles.has(getHolidayBaseTitle(event.title)),
  );
}

export function indexHolidays(events: readonly HolidayEvent[]): Map<DateKey, HolidayEvent[]> {
  const index = new Map<DateKey, HolidayEvent[]>();
  for (const event of events) {
    const items = index.get(event.date) ?? [];
    items.push(event);
    index.set(event.date, items);
  }
  for (const [date, items] of index) index.set(date, dedupeHolidayEvents(items));
  return index;
}

function parseDateKey(key: DateKey): Date {
  const [year, month, day] = key.split('-').map(Number);
  return createLocalDate(year, month - 1, day);
}

export function indexDayStatuses(events: readonly HolidayEvent[]): Map<DateKey, CalendarDayStatus> {
  const index = new Map<DateKey, CalendarDayStatus>();

  for (const event of events) {
    if (event.type !== 'dayoff' && event.type !== 'workday') continue;

    const start = parseDateKey(event.date);
    const parsedEnd = event.endDate ? parseDateKey(event.endDate) : addDays(start, 1);
    const end = parsedEnd.getTime() > start.getTime() ? parsedEnd : addDays(start, 1);
    for (let current = start; current.getTime() < end.getTime(); current = addDays(current, 1)) {
      index.set(formatDateKey(current), event.type);
    }
  }

  return index;
}

function buildCalendarDay(
  date: Date,
  currentMonth: number,
  holidayIndex: ReadonlyMap<DateKey, HolidayEvent[]>,
  dayStatusIndex: ReadonlyMap<DateKey, CalendarDayStatus>,
): CalendarDay {
  const normalized = normalizeDate(date);
  const key = formatDateKey(normalized);
  const weekday = (normalized.getDay() + 6) % 7;
  const todayKey = formatDateKey(new Date());

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
): CalendarDay[] {
  const firstDay = createLocalDate(year, monthIndex, 1);
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const daysInMonth = createLocalDate(year, monthIndex + 1, 0).getDate();
  const cellCount = fixedWeekCount || leadingDays + daysInMonth > 35 ? 42 : 35;
  const gridStart = addDays(firstDay, -leadingDays);

  return Array.from({ length: cellCount }, (_, index) =>
    buildCalendarDay(addDays(gridStart, index), monthIndex, holidayIndex, dayStatusIndex),
  );
}

export function getWeekDays(
  date: Date,
  holidayIndex: ReadonlyMap<DateKey, HolidayEvent[]>,
  dayStatusIndex: ReadonlyMap<DateKey, CalendarDayStatus> = EMPTY_DAY_STATUS_INDEX,
): CalendarDay[] {
  const firstDay = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => {
    const current = addDays(firstDay, index);
    return buildCalendarDay(current, current.getMonth(), holidayIndex, dayStatusIndex);
  });
}

export function getCalendarDay(
  date: Date,
  holidayIndex: ReadonlyMap<DateKey, HolidayEvent[]>,
  dayStatusIndex: ReadonlyMap<DateKey, CalendarDayStatus> = EMPTY_DAY_STATUS_INDEX,
): CalendarDay {
  return buildCalendarDay(date, date.getMonth(), holidayIndex, dayStatusIndex);
}

export function getYearMonths(
  year: number,
  holidayIndex: ReadonlyMap<DateKey, HolidayEvent[]>,
  dayStatusIndex: ReadonlyMap<DateKey, CalendarDayStatus> = EMPTY_DAY_STATUS_INDEX,
): CalendarMonth[] {
  return Array.from({ length: 12 }, (_, month) => ({
    year,
    month: month + 1,
    days: getMonthGrid(year, month, holidayIndex, true, dayStatusIndex),
  }));
}

export function getDaySpecialItems(day: CalendarDay): CalendarSpecialItem[] {
  const items: CalendarSpecialItem[] = day.holidays.map((holiday) => ({
    id: holiday.id,
    title: holiday.title,
    tone: holiday.type === 'dayoff' || holiday.type === 'workday' ? holiday.type : 'holiday',
  }));
  const solarTerm = day.lunar.solarTerm;
  const normalizedSolarTerm = solarTerm?.replace(/节$/, '');
  const includesSolarTerm = items.some(
    (item) => item.title.replace(/[（(].*$/, '').replace(/节$/, '') === normalizedSolarTerm,
  );

  if (solarTerm && !includesSolarTerm) {
    items.push({
      id: `${day.key}-solar-term`,
      title: solarTerm,
      tone: 'solar-term',
    });
  }
  return items;
}

function formatDatePart(date: Date, includeYear: boolean): string {
  return `${includeYear ? `${date.getFullYear()} 年 ` : ''}${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function getIsoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((target.getTime() - yearStart.getTime() + 86_400_000) / 604_800_000);
}

export function formatCalendarTitle(date: Date, view: 'year' | 'month' | 'week' | 'day'): string {
  if (view === 'year') return `${date.getFullYear()} 年 ${getLunarYearName(date.getFullYear())}`;
  if (view === 'month') return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
  if (view === 'day') {
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }

  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${formatDatePart(start, true)} – ${formatDatePart(end, !sameYear)}（第 ${getIsoWeekNumber(start)} 周）`;
}

export function getDayTooltip(day: CalendarDay): string {
  const details = [
    `${day.year} 年 ${day.month} 月 ${day.day} 日 ${day.weekdayText}`,
    `农历 ${day.lunar.lunarMonth}${day.lunar.lunarDay}`,
  ];
  if (day.dayStatus) details.push(day.dayStatus === 'dayoff' ? '休息日' : '调休上班');
  details.push(...getDaySpecialItems(day).map((item) => item.title));
  return details.join('\n');
}
