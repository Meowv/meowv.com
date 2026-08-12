import ICAL from 'ical.js';
import type { DateKey, HolidayEvent } from './types';

export const APPLE_CN_HOLIDAY_ICS_URL = 'https://calendars.icloud.com/holidays/cn_zh.ics/';
export const LOCAL_CN_HOLIDAY_ICS_URL = '/data/cn_zh.ics';

export const SOLAR_TERMS = new Set([
  '立春',
  '雨水',
  '惊蛰',
  '春分',
  '清明',
  '谷雨',
  '立夏',
  '小满',
  '芒种',
  '夏至',
  '小暑',
  '大暑',
  '立秋',
  '处暑',
  '白露',
  '秋分',
  '寒露',
  '霜降',
  '立冬',
  '小雪',
  '大雪',
  '冬至',
  '小寒',
  '大寒',
]);

type IcalTime = InstanceType<typeof ICAL.Time>;

function timeToDateKey(time: IcalTime): DateKey {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}

function inferHolidayType(title: string, description: string): HolidayEvent['type'] {
  const searchable = `${title} ${description}`;
  if (/(补班|上班|工作日|（班）|\(班\))/.test(searchable)) return 'workday';
  if (/(休息|放假|调休|（休）|\(休\))/.test(searchable)) return 'dayoff';
  return title ? 'holiday' : 'unknown';
}

function createHolidayEvent(
  event: InstanceType<typeof ICAL.Event>,
  startDate: IcalTime,
  endDate: IcalTime,
): HolidayEvent | null {
  const title = event.summary.trim();
  if (!title || SOLAR_TERMS.has(title)) return null;

  const date = timeToDateKey(startDate);
  const description = event.description?.trim() || undefined;
  return {
    id: `${event.uid || title}-${date}`,
    uid: event.uid || undefined,
    title,
    date,
    endDate: endDate ? timeToDateKey(endDate) : undefined,
    allDay: startDate.isDate,
    source: 'apple',
    description,
    type: inferHolidayType(title, description ?? ''),
  };
}

export async function fetchHolidayCalendar(signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(LOCAL_CN_HOLIDAY_ICS_URL, {
      method: 'GET',
      cache: 'no-cache',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Holiday calendar request failed: ${response.status}`);

    const text = await response.text();
    if (!text.includes('BEGIN:VCALENDAR')) {
      throw new Error('Holiday calendar response is not valid iCalendar data.');
    }
    return text;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function parseHolidayCalendar(
  text: string,
  minYear: number,
  maxYear: number,
): HolidayEvent[] {
  const calendar = new ICAL.Component(ICAL.parse(text));
  const minDate = `${minYear}-01-01` as DateKey;
  const maxDate = `${maxYear}-12-31` as DateKey;
  const events = new Map<string, HolidayEvent>();

  for (const component of calendar.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(component);

    if (!event.isRecurring()) {
      const holiday = createHolidayEvent(event, event.startDate, event.endDate);
      if (holiday && holiday.date >= minDate && holiday.date <= maxDate) {
        events.set(holiday.id, holiday);
      }
      continue;
    }

    const iterator = event.iterator();
    let occurrenceCount = 0;
    while (occurrenceCount < 20000) {
      const occurrence = iterator.next() as IcalTime | null;
      if (!occurrence) break;
      const occurrenceKey = timeToDateKey(occurrence);
      if (occurrenceKey > maxDate) break;
      occurrenceCount += 1;
      if (occurrenceKey < minDate) continue;

      const details = event.getOccurrenceDetails(occurrence);
      const holiday = createHolidayEvent(details.item, details.startDate, details.endDate);
      if (holiday) events.set(holiday.id, holiday);
    }
  }

  return [...events.values()].sort((left, right) =>
    left.date === right.date
      ? left.title.localeCompare(right.title, 'zh-CN')
      : left.date.localeCompare(right.date),
  );
}
