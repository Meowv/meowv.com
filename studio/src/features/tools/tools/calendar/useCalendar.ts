import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  addDays,
  createLocalDate,
  formatCalendarTitle,
  getCalendarDay,
  indexDayStatuses,
  getMonthGrid,
  getWeekDays,
  getYearMonths,
  indexHolidays,
  normalizeDate,
} from './calendar-date.util';
import { fetchHolidayCalendar, parseHolidayCalendar } from './holiday.service';
import type { CalendarView, HolidayEvent } from './types';

export function useCalendar() {
  const currentView = ref<CalendarView>('month');
  const selectedDate = ref(normalizeDate(new Date()));
  const holidays = ref<HolidayEvent[]>([]);
  const holidayLoading = ref(false);
  const holidayError = ref<string | null>(null);

  let holidayText = '';
  let holidayRequestId = 0;
  let holidayController: AbortController | null = null;

  const selectedYear = computed(() => selectedDate.value.getFullYear());
  const holidayIndex = computed(() => indexHolidays(holidays.value));
  const dayStatusIndex = computed(() => indexDayStatuses(holidays.value));
  const calendarTitle = computed(() => formatCalendarTitle(selectedDate.value, currentView.value));
  const yearMonths = computed(() =>
    getYearMonths(selectedYear.value, holidayIndex.value, dayStatusIndex.value),
  );
  const monthDays = computed(() =>
    getMonthGrid(
      selectedYear.value,
      selectedDate.value.getMonth(),
      holidayIndex.value,
      false,
      dayStatusIndex.value,
    ),
  );
  const weekDays = computed(() =>
    getWeekDays(selectedDate.value, holidayIndex.value, dayStatusIndex.value),
  );
  const dayInfo = computed(() =>
    getCalendarDay(selectedDate.value, holidayIndex.value, dayStatusIndex.value),
  );

  function rebuildHolidays(): void {
    if (!holidayText) return;
    try {
      holidays.value = parseHolidayCalendar(
        holidayText,
        selectedYear.value - 1,
        selectedYear.value + 1,
      );
      holidayError.value = null;
    } catch {
      holidays.value = [];
      holidayError.value = '节日数据暂时无法加载';
    }
  }

  async function loadHolidays(): Promise<void> {
    const requestId = ++holidayRequestId;
    holidayController?.abort();
    holidayController = new AbortController();
    holidayLoading.value = true;
    holidayError.value = null;

    try {
      holidayText = await fetchHolidayCalendar(holidayController.signal);
      if (requestId !== holidayRequestId) return;
      rebuildHolidays();
    } catch {
      if (requestId !== holidayRequestId) return;
      holidays.value = [];
      holidayError.value = '节日数据暂时无法加载';
    } finally {
      if (requestId === holidayRequestId) holidayLoading.value = false;
    }
  }

  function setView(view: CalendarView): void {
    currentView.value = view;
  }

  function selectDate(date: Date, view: CalendarView = 'day'): void {
    selectedDate.value = normalizeDate(date);
    currentView.value = view;
  }

  function openMonth(year: number, month: number): void {
    selectedDate.value = createLocalDate(year, month - 1, 1);
    currentView.value = 'month';
  }

  function goToday(): void {
    selectedDate.value = normalizeDate(new Date());
  }

  function move(amount: -1 | 1): void {
    const date = selectedDate.value;
    if (currentView.value === 'year') {
      selectedDate.value = createLocalDate(
        date.getFullYear() + amount,
        date.getMonth(),
        date.getDate(),
      );
      return;
    }
    if (currentView.value === 'month') {
      selectedDate.value = createLocalDate(date.getFullYear(), date.getMonth() + amount, 1);
      return;
    }
    selectedDate.value = addDays(date, currentView.value === 'week' ? amount * 7 : amount);
  }

  watch(selectedYear, rebuildHolidays);
  onMounted(() => void loadHolidays());
  onBeforeUnmount(() => {
    holidayRequestId += 1;
    holidayController?.abort();
  });

  return {
    currentView,
    selectedDate,
    holidays,
    holidayLoading,
    holidayError,
    calendarTitle,
    yearMonths,
    monthDays,
    weekDays,
    dayInfo,
    setView,
    selectDate,
    openMonth,
    goToday,
    goPrevious: () => move(-1),
    goNext: () => move(1),
    retryHolidays: loadHolidays,
  };
}
