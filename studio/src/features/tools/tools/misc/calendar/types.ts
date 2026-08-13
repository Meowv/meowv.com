export const CALENDAR_VIEWS = ['year', 'month', 'week', 'day'] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export type DateKey = `${number}-${string}-${string}`;
export type CalendarDayStatus = 'dayoff' | 'workday';

export interface HolidayEvent {
  id: string;
  uid?: string;
  title: string;
  date: DateKey;
  endDate?: DateKey;
  allDay: boolean;
  source: 'apple';
  description?: string;
  type: 'holiday' | 'workday' | 'dayoff' | 'unknown';
}

export interface LunarDateInfo {
  lunarYear: string;
  lunarMonth: string;
  lunarDay: string;
  shortText: string;
  fullText: string;
  solarTerm?: string;
}

export interface CalendarDay {
  key: DateKey;
  date: Date;
  year: number;
  month: number;
  day: number;
  weekday: number;
  weekdayText: string;
  isToday: boolean;
  isWeekend: boolean;
  isCurrentMonth: boolean;
  dayStatus?: CalendarDayStatus;
  lunar: LunarDateInfo;
  holidays: HolidayEvent[];
}

export interface CalendarSpecialItem {
  id: string;
  title: string;
  tone: 'holiday' | 'dayoff' | 'workday' | 'solar-term';
}

export interface CalendarMonth {
  year: number;
  month: number;
  days: CalendarDay[];
}
