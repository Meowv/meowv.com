import ICAL from 'ical.js';
import type {
  CalendarCoverage,
  DateKey,
  HolidayEvent,
  HolidayPeriod,
  HolidaySnapshot,
  HolidaySourceId,
  ResolvedHolidayData,
} from './types';

export const SOURCE_NAMES: Record<HolidaySourceId, string> = {
  lanceliao: 'lanceliao · 中国节假日',
  muhac: 'muhac · 放假与补班',
};

export const SOURCE_URLS = {
  lanceliao: 'https://www.shuyz.com/githubfiles/china-holiday-calender/master/holidayAPI.json',
  muhacRest: 'https://ical.muhan.org/rest.ics',
  muhacWork: 'https://ical.muhan.org/work.ics',
} as const;

export const MAX_HOLIDAY_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 20000;
const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const MIN_DATE: DateKey = '1900-01-01';
const MAX_END_DATE: DateKey = '2101-01-01';
const ANNUAL_HOLIDAYS = ['元旦', '春节', '清明节', '劳动节', '端午节', '中秋节', '国庆节'];

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): Record<string, unknown> {
  requireValue(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    '无效的数据结构',
  );
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, maximum = 200): string {
  requireValue(typeof value === 'string' && value.trim().length > 0, '缺少必要的文本字段');
  requireValue(value.length <= maximum, '文本字段过长');
  return value.trim();
}

function optionalString(value: unknown, maximum: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return boundedString(value, maximum);
}

function validateSize(value: unknown): void {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  requireValue(typeof serialized === 'string', '无效的日历数据');
  requireValue(serialized.length <= MAX_HOLIDAY_BYTES, '日历数据超过大小限制');
  requireValue(new TextEncoder().encode(serialized).length <= MAX_HOLIDAY_BYTES, '日历数据过大');
}

function yearValue(value: string): number {
  requireValue(/^\d{4}$/.test(value), '无效的年度');
  const year = Number(value);
  requireValue(year >= MIN_YEAR && year <= MAX_YEAR, '年度超出支持范围');
  return year;
}

function dateKey(value: unknown, allowEnd = false): DateKey {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), '无效的日期');
  const [year, month, day] = value.split('-').map(Number);
  const civilDate = new Date(Date.UTC(year!, month! - 1, day!));
  requireValue(
    civilDate.getUTCFullYear() === year &&
      civilDate.getUTCMonth() === month! - 1 &&
      civilDate.getUTCDate() === day &&
      value >= MIN_DATE &&
      (allowEnd ? value <= MAX_END_DATE : value < MAX_END_DATE),
    '日期超出范围或不存在',
  );
  return value as DateKey;
}

function dayNumber(value: DateKey): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!) / DAY_MS;
}

function addDays(value: DateKey, count: number): DateKey {
  return new Date((dayNumber(value) + count) * DAY_MS).toISOString().slice(0, 10) as DateKey;
}

function validateSpan(start: DateKey, end: DateKey): number {
  const duration = dayNumber(end) - dayNumber(start);
  requireValue(duration > 0 && duration <= 31, '假期区间长度无效');
  return duration;
}

function validateFetchedAt(value: unknown): number {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= 0, '无效的获取时间');
  return value;
}

function announcementUrl(value: unknown): string | undefined {
  const url = optionalString(value, 2048);
  if (!url) return undefined;
  const parsed = new URL(url);
  requireValue(
    ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password,
    '无效的公告地址',
  );
  return url;
}

function sortEvents(events: HolidayEvent[]): HolidayEvent[] {
  return events.sort(
    (left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
  );
}

function validateEvents(events: HolidayEvent[]): void {
  requireValue(events.length <= MAX_EVENTS, '日历事件数量超过限制');
  const statuses = new Map<DateKey, HolidayEvent['type']>();
  const ids = new Set<string>();
  for (const event of events) {
    requireValue(!ids.has(event.id), '日历事件标识重复');
    ids.add(event.id);
    const endDate = event.endDate ?? addDays(event.date, 1);
    validateSpan(event.date, endDate);
    for (let current = event.date; current < endDate; current = addDays(current, 1)) {
      const existing = statuses.get(current);
      requireValue(!existing || existing === event.type, '同一天存在冲突的休班安排');
      statuses.set(current, event.type);
    }
  }
}

function eventYears(event: HolidayEvent): number[] {
  const first = Number(event.date.slice(0, 4));
  const last = Number(addDays(event.endDate ?? addDays(event.date, 1), -1).slice(0, 4));
  return first === last ? [first] : [first, last];
}

function addPartialCoverage(
  events: HolidayEvent[],
  coverage: Record<number, CalendarCoverage>,
): void {
  for (const event of events) {
    for (const year of eventYears(event)) coverage[year] ??= 'partial';
  }
}

function primaryOwner(event: HolidayEvent): number {
  const match = /^lanceliao:(\d{4}):/.exec(event.period?.id ?? '');
  requireValue(match, '主源事件缺少年度归属');
  return yearValue(match[1]!);
}

export function parsePrimaryHolidays(input: unknown, fetchedAt: number): HolidaySnapshot {
  validateSize(input);
  const data = record(input);
  boundedString(data.Name);
  boundedString(data.Version, 40);
  requireValue(data.Timezone === 'Asia/Shanghai', '主源时区不受支持');
  const updatedAt = boundedString(data.Generated, 80);
  const years = record(data.Years);
  const entries = Object.entries(years);
  requireValue(entries.length > 0 && entries.length <= MAX_YEAR - MIN_YEAR + 1, '缺少年度安排');
  const events: HolidayEvent[] = [];
  const coverage: Record<number, CalendarCoverage> = {};

  for (const [yearKey, table] of entries) {
    const year = yearValue(yearKey);
    requireValue(
      Array.isArray(table) && table.length >= 6 && table.length <= 7,
      `${year} 年安排不完整`,
    );
    const names = new Set<string>();
    for (const value of table) {
      const item = record(value);
      const title = boundedString(item.Name);
      const holidayNames = title.split(/[、，,]/).map((name) => name.trim());
      requireValue(
        holidayNames.length === 1 ||
          (holidayNames.length === 2 &&
            holidayNames.every((name) => ['中秋节', '国庆节'].includes(name))),
        '无法识别合并假期名称',
      );
      for (const name of holidayNames) {
        requireValue(ANNUAL_HOLIDAYS.includes(name) && !names.has(name), '年度假期名称缺失或重复');
        names.add(name);
      }
      const startDate = dateKey(item.StartDate);
      const inclusiveEndDate = dateKey(item.EndDate);
      const endDate = dateKey(addDays(inclusiveEndDate, 1), true);
      const duration = validateSpan(startDate, endDate);
      requireValue(duration === item.Duration, '假期天数与日期区间不一致');
      requireValue(
        startDate <= `${year}-12-31` && inclusiveEndDate >= `${year}-01-01`,
        '假期不属于声明的年度',
      );
      requireValue(
        Array.isArray(item.CompDays) && item.CompDays.length <= 20,
        '无效的补班日期列表',
      );
      const compDays = item.CompDays.map((value: unknown) => dateKey(value));
      requireValue(new Set(compDays).size === compDays.length, '补班日期重复');
      for (const compDay of compDays) {
        requireValue(
          Math.abs(dayNumber(compDay) - dayNumber(startDate)) <= 62,
          '补班日期距离关联假期过远',
        );
      }
      const period: HolidayPeriod = {
        id: `lanceliao:${year}:${title}`,
        title,
        startDate,
        endDate,
        compDays: [...compDays].sort(),
        source: 'lanceliao',
        announcementUrl: announcementUrl(item.URL),
      };
      const description = optionalString(item.Memo, 4096);
      events.push({
        id: `${period.id}:${startDate}:dayoff`,
        title,
        date: startDate,
        endDate,
        allDay: true,
        source: 'lanceliao',
        description,
        type: 'dayoff',
        period,
      });
      for (const compDay of compDays) {
        events.push({
          id: `${period.id}:${compDay}:workday`,
          title: `${title}补班`,
          date: compDay,
          endDate: addDays(compDay, 1),
          allDay: true,
          source: 'lanceliao',
          description,
          type: 'workday',
          period,
        });
      }
    }
    requireValue(names.size === ANNUAL_HOLIDAYS.length, `${year} 年安排不完整`);
    coverage[year] = 'complete';
  }
  validateEvents(events);
  addPartialCoverage(events, coverage);
  return {
    source: 'lanceliao',
    events: sortEvents(events),
    coverage,
    fetchedAt: validateFetchedAt(fetchedAt),
    updatedAt,
  };
}

function icalDate(
  component: InstanceType<typeof ICAL.Component>,
  name: string,
  allowEnd = false,
): DateKey {
  const property = component.getFirstProperty(name);
  requireValue(property?.type === 'date', '备用源必须使用全天日期');
  return dateKey(property.toJSON()[3], allowEnd);
}

function parseBackupFeed(text: string, type: 'dayoff' | 'workday'): HolidayEvent[] {
  validateSize(text);
  requireValue(
    /^BEGIN:VCALENDAR\r?\n/i.test(text.trim()) && /END:VCALENDAR\s*$/i.test(text),
    '无效的 ICS 数据',
  );
  const calendar = new ICAL.Component(ICAL.parse(text));
  requireValue(calendar.name === 'vcalendar', '无效的 ICS 日历');
  const components = calendar.getAllSubcomponents('vevent');
  requireValue(
    components.length > 0 && components.length <= MAX_EVENTS,
    '备用源没有有效事件或数量过多',
  );
  const events: HolidayEvent[] = [];
  for (const component of components) {
    requireValue(
      !['rrule', 'rdate', 'exdate', 'exrule', 'recurrence-id'].some((name) =>
        component.hasProperty(name),
      ),
      '备用源仅支持明确日期，不接受重复规则',
    );
    requireValue(!component.hasProperty('duration'), '备用源仅支持明确的起止日期');
    const date = icalDate(component, 'dtstart');
    const endDate = component.hasProperty('dtend')
      ? icalDate(component, 'dtend', true)
      : addDays(date, 1);
    validateSpan(date, endDate);
    const title = boundedString(component.getFirstPropertyValue('summary'));
    const uid = optionalString(component.getFirstPropertyValue('uid'), 256);
    events.push({
      id: `muhac:${type}:${uid || title}:${date}`,
      uid,
      title,
      date,
      endDate,
      allDay: true,
      source: 'muhac',
      description: optionalString(component.getFirstPropertyValue('description'), 4096),
      type,
    });
  }
  return events;
}

export function parseBackupHolidays(
  rest: string,
  work: string,
  fetchedAt: number,
): HolidaySnapshot {
  const events = [...parseBackupFeed(rest, 'dayoff'), ...parseBackupFeed(work, 'workday')];
  validateEvents(events);
  const coverage: Record<number, CalendarCoverage> = {};
  addPartialCoverage(events, coverage);
  return {
    source: 'muhac',
    events: sortEvents(events),
    coverage,
    fetchedAt: validateFetchedAt(fetchedAt),
    updatedAt: null,
  };
}

function clipEvent(event: HolidayEvent, year: number): HolidayEvent | null {
  const startDate = `${year}-01-01` as DateKey;
  const endDate = `${year + 1}-01-01` as DateKey;
  const originalEndDate = event.endDate ?? addDays(event.date, 1);
  if (event.date >= endDate || originalEndDate <= startDate) return null;
  return {
    ...event,
    id: `${event.id}:year:${year}`,
    date: event.date < startDate ? startDate : event.date,
    endDate: originalEndDate > endDate ? endDate : originalEndDate,
  };
}

export function mergeHolidaySnapshots(
  previous: HolidaySnapshot | undefined,
  incoming: HolidaySnapshot,
): HolidaySnapshot {
  if (!previous) return incoming;
  requireValue(previous.source === incoming.source, '不能合并不同来源的快照');
  if (previous.fetchedAt > incoming.fetchedAt) return previous;
  let retained: HolidayEvent[];
  const coverage: Record<number, CalendarCoverage> = {};
  if (incoming.source === 'lanceliao') {
    retained = previous.events.filter(
      (event) => incoming.coverage[primaryOwner(event)] !== 'complete',
    );
    for (const snapshot of [previous, incoming]) {
      for (const [year, value] of Object.entries(snapshot.coverage)) {
        if (value === 'complete') coverage[Number(year)] = value;
      }
    }
  } else {
    retained = previous.events.flatMap((event) =>
      eventYears(event).flatMap((year) => {
        if (incoming.coverage[year]) return [];
        const clipped = clipEvent(event, year);
        return clipped
          ? [{ ...clipped, id: event.id.replace(/:year:\d{4}$/, '') + `:year:${year}` }]
          : [];
      }),
    );
  }
  const events = sortEvents([...retained, ...incoming.events]);
  validateEvents(events);
  addPartialCoverage(events, coverage);
  return { ...incoming, events, coverage };
}

export function resolveHolidayData(snapshots: HolidaySnapshot[]): ResolvedHolidayData {
  const bySource = new Map<HolidaySourceId, HolidaySnapshot>();
  for (const snapshot of [...snapshots].sort((left, right) => left.fetchedAt - right.fetchedAt)) {
    bySource.set(snapshot.source, mergeHolidaySnapshots(bySource.get(snapshot.source), snapshot));
  }
  const primary = bySource.get('lanceliao');
  const backup = bySource.get('muhac');
  const coverage: Record<number, CalendarCoverage> = {};
  const sourcesByYear: ResolvedHolidayData['sourcesByYear'] = {};
  const events: HolidayEvent[] = [];
  for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
    const selected =
      primary?.coverage[year] === 'complete'
        ? primary
        : backup?.coverage[year] === 'partial'
          ? backup
          : primary?.coverage[year] === 'partial'
            ? primary
            : undefined;
    coverage[year] = selected?.coverage[year] ?? 'unavailable';
    if (!selected) continue;
    sourcesByYear[year] = selected.source;
    for (const event of selected.events) {
      const clipped = clipEvent(event, year);
      if (clipped) events.push(clipped);
    }
  }
  return { events: sortEvents(events), coverage, sourcesByYear };
}

export function restoreHolidaySnapshot(input: unknown, source: HolidaySourceId): HolidaySnapshot {
  validateSize(input);
  const snapshot = record(input);
  requireValue(snapshot.source === source, '缓存来源不匹配');
  const fetchedAt = validateFetchedAt(snapshot.fetchedAt);
  requireValue(
    Array.isArray(snapshot.events) &&
      snapshot.events.length > 0 &&
      snapshot.events.length <= MAX_EVENTS,
    '缓存事件无效',
  );
  const rawCoverage = record(snapshot.coverage);
  const coverage: Record<number, CalendarCoverage> = {};
  for (const [year, value] of Object.entries(rawCoverage)) {
    requireValue(value === 'complete' || value === 'partial', '缓存覆盖状态无效');
    coverage[yearValue(year)] = value;
  }
  const events = snapshot.events.map((value: unknown): HolidayEvent => {
    const event = record(value);
    requireValue(event.source === source && event.allDay === true, '缓存事件来源或日期类型无效');
    requireValue(event.type === 'dayoff' || event.type === 'workday', '缓存事件状态无效');
    return {
      id: boundedString(event.id, 600),
      uid: optionalString(event.uid, 256),
      title: boundedString(event.title),
      date: dateKey(event.date),
      endDate: dateKey(event.endDate, true),
      allDay: true,
      source,
      description: optionalString(event.description, 4096),
      type: event.type,
      ...(event.period ? { period: record(event.period) as unknown as HolidayPeriod } : {}),
    };
  });
  validateEvents(events);

  if (source === 'lanceliao') {
    const years: Record<number, unknown[]> = {};
    const seen = new Set<string>();
    for (const [year, value] of Object.entries(coverage)) {
      if (value === 'complete') years[Number(year)] = [];
    }
    for (const event of events) {
      const owner = primaryOwner(event);
      requireValue(years[owner], '缓存事件年度缺少完整校验');
      const period = event.period!;
      requireValue(period.source === source, '缓存假期来源不匹配');
      if (seen.has(period.id)) continue;
      seen.add(period.id);
      years[owner]!.push({
        Name: period.title,
        StartDate: dateKey(period.startDate),
        EndDate: addDays(dateKey(period.endDate, true), -1),
        Duration: validateSpan(period.startDate, period.endDate),
        CompDays: period.compDays,
        URL: period.announcementUrl,
        Memo: event.description,
      });
    }
    const restored = parsePrimaryHolidays(
      {
        Name: 'cache',
        Version: '1',
        Generated: snapshot.updatedAt,
        Timezone: 'Asia/Shanghai',
        Years: years,
      },
      fetchedAt,
    );
    requireValue(
      JSON.stringify(sortEvents(events)) === JSON.stringify(restored.events),
      '缓存事件与年度安排不一致',
    );
    requireValue(
      Object.keys(coverage).length === Object.keys(restored.coverage).length &&
        Object.entries(coverage).every(
          ([year, value]) => restored.coverage[Number(year)] === value,
        ),
      '缓存年度覆盖不一致',
    );
    return restored;
  }
  requireValue(
    snapshot.updatedAt === null && events.every((event) => !event.period),
    '备用缓存包含不支持的元数据',
  );
  const expectedCoverage: Record<number, CalendarCoverage> = {};
  addPartialCoverage(events, expectedCoverage);
  requireValue(
    Object.keys(coverage).length === Object.keys(expectedCoverage).length &&
      Object.entries(coverage).every(([year, value]) => value === expectedCoverage[Number(year)]),
    '备用缓存不能声明完整年度',
  );
  return { source, fetchedAt, updatedAt: null, events: sortEvents(events), coverage };
}
