export const CALENDAR_VIEWS = ['year', 'month', 'week', 'day'] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export type DateKey = `${number}-${string}-${string}`;
export type CalendarDayStatus = 'dayoff' | 'workday';
export type HolidaySourceId = 'lanceliao' | 'muhac';
export type CalendarCoverage = 'complete' | 'partial' | 'unavailable';

export interface HolidayPeriod {
  id: string;
  title: string;
  startDate: DateKey;
  endDate: DateKey;
  compDays: DateKey[];
  source: HolidaySourceId;
  announcementUrl?: string;
}

export interface HolidaySnapshot {
  source: HolidaySourceId;
  events: HolidayEvent[];
  coverage: Record<number, CalendarCoverage>;
  fetchedAt: number;
  updatedAt: string | null;
}

export interface HolidayRepositoryState {
  snapshots: HolidaySnapshot[];
  loading: boolean;
  errors: Partial<Record<HolidaySourceId, string>>;
}

export interface ResolvedHolidayData {
  events: HolidayEvent[];
  coverage: Record<number, CalendarCoverage>;
  sourcesByYear: Partial<Record<number, HolidaySourceId>>;
}

export interface CalendarPreferences {
  weekStartsOn: 0 | 1;
  showLunar: boolean;
  showSolarTerms: boolean;
  showWeekNumbers: boolean;
  monthDensity: 'auto' | 'compact' | 'detailed';
}

export interface CalendarBuildOptions {
  todayKey?: DateKey;
  weekStartsOn?: 0 | 1;
}

export type CalendarPanel =
  'jump' | 'holidays' | 'countdown' | 'range' | 'lunar' | 'solar' | 'preferences' | 'sources';

export interface HolidayEvent {
  id: string;
  uid?: string;
  title: string;
  date: DateKey;
  endDate?: DateKey;
  allDay: boolean;
  source: HolidaySourceId;
  description?: string;
  type: 'holiday' | 'workday' | 'dayoff' | 'unknown';
  period?: HolidayPeriod;
}

export interface LunarDateInfo {
  lunarYear: string;
  lunarMonth: string;
  lunarDay: string;
  shortText: string;
  fullText: string;
  solarTerm?: string;
  festivals: string[];
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
