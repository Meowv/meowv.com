import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { STORAGE_POLICY } from '@/core/privacy/storage';
import {
  clampDate,
  createLocalDate,
  formatCalendarTitle,
  formatDateKey,
  getCalendarDay,
  getMonthGrid,
  getWeekDays,
  getYearMonths,
  indexDayStatuses,
  indexHolidays,
  isSupportedDate,
  normalizeDate,
  shiftCalendarDate,
} from './calendar-date.util';
import { createHolidayRepository, resolveHolidayData } from './holiday.repository';
import {
  CALENDAR_VIEWS,
  type CalendarPanel,
  type CalendarPreferences,
  type CalendarView,
  type HolidayRepositoryState,
} from './types';

const VIEW_STORAGE_KEY = `${STORAGE_POLICY.preferences}:calendar-view`;
const PREFERENCES_STORAGE_KEY = `${STORAGE_POLICY.preferences}:calendar-display`;

export const DEFAULT_CALENDAR_PREFERENCES: CalendarPreferences = {
  weekStartsOn: 1,
  showLunar: true,
  showSolarTerms: true,
  showWeekNumbers: true,
  monthDensity: 'auto',
};

function readStoredView(): CalendarView {
  try {
    const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
    return CALENDAR_VIEWS.includes(storedView as CalendarView)
      ? (storedView as CalendarView)
      : 'month';
  } catch {
    return 'month';
  }
}

export function validatePreferences(input: unknown): CalendarPreferences {
  const result = { ...DEFAULT_CALENDAR_PREFERENCES };
  if (!input || typeof input !== 'object') return result;
  const value = input as Partial<CalendarPreferences>;
  if (value.weekStartsOn === 0 || value.weekStartsOn === 1)
    result.weekStartsOn = value.weekStartsOn;
  for (const key of ['showLunar', 'showSolarTerms', 'showWeekNumbers'] as const) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  if (['auto', 'compact', 'detailed'].includes(value.monthDensity ?? ''))
    result.monthDensity = value.monthDensity!;
  return result;
}

function readPreferences(): CalendarPreferences {
  try {
    return validatePreferences(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_CALENDAR_PREFERENCES };
  }
}

function persistPreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function useCalendar() {
  const currentView = ref<CalendarView>(readStoredView());
  const today = ref(clampDate(normalizeDate(new Date())));
  const selectedDate = ref(today.value);
  const preferences = ref(readPreferences());
  const panel = ref<CalendarPanel | null>(null);
  const repositoryState = ref<HolidayRepositoryState>({
    snapshots: [],
    loading: false,
    errors: {},
  });
  const repository = createHolidayRepository({
    onChange: (state) => (repositoryState.value = state),
  });
  repositoryState.value = repository.getState();
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;

  const todayKey = computed(() => formatDateKey(today.value));
  const selectedKey = computed(() => formatDateKey(selectedDate.value));
  const selectedYear = computed(() => selectedDate.value.getFullYear());
  const holidayData = computed(() => resolveHolidayData(repositoryState.value.snapshots));
  const holidayIndex = computed(() => indexHolidays(holidayData.value.events));
  const dayStatusIndex = computed(() => indexDayStatuses(holidayData.value.events));
  const buildOptions = computed(() => ({
    todayKey: todayKey.value,
    weekStartsOn: preferences.value.weekStartsOn,
  }));
  const calendarTitle = computed(() =>
    formatCalendarTitle(selectedDate.value, currentView.value, preferences.value),
  );
  const yearMonths = computed(() =>
    getYearMonths(selectedYear.value, holidayIndex.value, dayStatusIndex.value, buildOptions.value),
  );
  const monthDays = computed(() =>
    getMonthGrid(
      selectedYear.value,
      selectedDate.value.getMonth(),
      holidayIndex.value,
      false,
      dayStatusIndex.value,
      buildOptions.value,
    ),
  );
  const weekDays = computed(() =>
    getWeekDays(selectedDate.value, holidayIndex.value, dayStatusIndex.value, buildOptions.value),
  );
  const dayInfo = computed(() =>
    getCalendarDay(
      selectedDate.value,
      holidayIndex.value,
      dayStatusIndex.value,
      buildOptions.value,
    ),
  );
  const canGoPrevious = computed(
    () =>
      shiftCalendarDate(selectedDate.value, -1, currentView.value).getTime() !==
      selectedDate.value.getTime(),
  );
  const canGoNext = computed(
    () =>
      shiftCalendarDate(selectedDate.value, 1, currentView.value).getTime() !==
      selectedDate.value.getTime(),
  );

  function setView(view: CalendarView): void {
    if (CALENDAR_VIEWS.includes(view)) currentView.value = view;
  }

  function selectDate(date: Date, view: CalendarView = currentView.value): void {
    if (!isSupportedDate(date)) return;
    selectedDate.value = normalizeDate(date);
    currentView.value = view;
  }

  function openMonth(year: number, month: number): void {
    const lastDay = createLocalDate(year, month, 0).getDate();
    selectDate(
      createLocalDate(year, month - 1, Math.min(selectedDate.value.getDate(), lastDay)),
      'month',
    );
  }

  function refreshToday(): void {
    today.value = clampDate(normalizeDate(new Date()));
    if (midnightTimer !== undefined) clearTimeout(midnightTimer);
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    midnightTimer = setTimeout(refreshToday, nextDay.getTime() - now.getTime() + 30);
  }

  function handleVisibility(): void {
    if (document.visibilityState !== 'visible') return;
    refreshToday();
    void repository.refresh();
  }

  function goToday(): void {
    refreshToday();
    selectedDate.value = today.value;
  }

  function move(amount: -1 | 1): void {
    selectedDate.value = shiftCalendarDate(selectedDate.value, amount, currentView.value);
  }

  function updatePreferences(value: Partial<CalendarPreferences>): void {
    preferences.value = validatePreferences({ ...preferences.value, ...value });
  }

  watch(currentView, (view) => persistPreference(VIEW_STORAGE_KEY, view));
  watch(preferences, (value) => persistPreference(PREFERENCES_STORAGE_KEY, JSON.stringify(value)));
  onMounted(() => {
    refreshToday();
    document.addEventListener('visibilitychange', handleVisibility);
    void repository.refresh();
  });
  onBeforeUnmount(() => {
    repository.dispose();
    if (midnightTimer !== undefined) clearTimeout(midnightTimer);
    document.removeEventListener('visibilitychange', handleVisibility);
  });

  return {
    currentView,
    selectedDate,
    selectedKey,
    selectedYear,
    today,
    preferences,
    panel,
    repositoryState,
    holidayData,
    calendarTitle,
    yearMonths,
    monthDays,
    weekDays,
    dayInfo,
    canGoPrevious,
    canGoNext,
    setView,
    selectDate,
    openMonth,
    goToday,
    updatePreferences,
    goPrevious: () => move(-1),
    goNext: () => move(1),
    retryHolidays: () => repository.refresh(true),
  };
}
