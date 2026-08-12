<script setup lang="ts">
import CalendarToolbar from './components/CalendarToolbar.vue';
import DayView from './components/DayView.vue';
import MonthView from './components/MonthView.vue';
import WeekView from './components/WeekView.vue';
import YearView from './components/YearView.vue';
import { useCalendar } from './useCalendar';

const {
  currentView,
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
  goPrevious,
  goNext,
  retryHolidays,
} = useCalendar();
</script>

<template>
  <section class="calendar-tool" aria-label="在线中文日历">
    <CalendarToolbar
      :current-view="currentView"
      :title="calendarTitle"
      :holiday-loading="holidayLoading"
      :holiday-error="holidayError"
      @previous="goPrevious"
      @next="goNext"
      @today="goToday"
      @retry="retryHolidays"
      @update:view="setView"
    />

    <div class="calendar-tool__viewport">
      <YearView v-if="currentView === 'year'" :months="yearMonths" @open-month="openMonth" />
      <MonthView v-else-if="currentView === 'month'" :days="monthDays" @open-day="selectDate" />
      <WeekView v-else-if="currentView === 'week'" :days="weekDays" @select-date="selectDate" />
      <DayView v-else :day="dayInfo" />
    </div>
  </section>
</template>

<style>
.calendar-tool {
  --calendar-holiday: #b94343;
  --calendar-solar-term: #13836f;
  --calendar-event: #1594d0;
  --calendar-workday: #b45309;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface-solid);
  box-shadow: 0 8px 24px rgb(16 24 40 / 4%);
  color: var(--color-text);
}

:root[data-theme='dark'] .calendar-tool {
  --calendar-holiday: #f28b82;
  --calendar-solar-term: #5dd3b7;
  --calendar-workday: #f6ad55;
}

.calendar-tool button {
  color: inherit;
  font: inherit;
}

.calendar-toolbar {
  display: grid;
  min-height: 70px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
  align-items: center;
  gap: 16px;
  background: color-mix(in srgb, var(--color-surface-soft) 72%, transparent);
}

.calendar-toolbar h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(16px, 1.6vw, 21px);
  font-weight: 790;
  letter-spacing: -0.025em;
  text-align: center;
}

.calendar-toolbar__navigation,
.calendar-toolbar__arrows,
.calendar-toolbar__views {
  display: flex;
  align-items: center;
}

.calendar-toolbar__navigation {
  gap: 8px;
}

.calendar-toolbar__arrows,
.calendar-toolbar__views {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: var(--color-surface-solid);
}

.calendar-toolbar__arrows button,
.calendar-toolbar__views button,
.calendar-toolbar__today {
  display: inline-flex;
  min-height: 34px;
  border: 0;
  align-items: center;
  justify-content: center;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  font-weight: 720;
}

.calendar-toolbar__arrows button {
  width: 36px;
  padding: 0;
}

.calendar-toolbar__arrows button + button,
.calendar-toolbar__views button + button {
  border-left: 1px solid var(--color-border);
}

.calendar-toolbar__today {
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: var(--color-surface-solid);
}

.calendar-toolbar__views {
  justify-self: end;
}

.calendar-toolbar__views button {
  min-width: 42px;
  padding: 0 10px;
}

.calendar-toolbar button:hover,
.calendar-toolbar__views button.is-active {
  background: color-mix(in srgb, var(--tools-accent) 10%, var(--color-surface-solid));
  color: var(--tools-accent);
}

.calendar-toolbar__views button.is-active {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tools-accent) 24%, transparent);
}

.calendar-toolbar button:focus-visible,
.calendar-tool__viewport button:focus-visible,
.calendar-source-status button:focus-visible {
  outline: 2px solid var(--tools-accent);
  outline-offset: -2px;
}

.calendar-source-status {
  display: flex;
  min-height: 34px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: color-mix(in srgb, var(--calendar-holiday) 6%, var(--color-surface-solid));
  color: var(--color-text-muted);
  font-size: 11px;
}

.calendar-source-status button {
  display: inline-flex;
  min-height: 26px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--calendar-holiday) 28%, var(--color-border));
  border-radius: 7px;
  align-items: center;
  gap: 4px;
  background: var(--color-surface-solid);
  color: var(--calendar-holiday);
  cursor: pointer;
  font-size: 10px;
  font-weight: 720;
}

.calendar-tool__viewport {
  min-width: 0;
  padding: 20px;
}

.calendar-year-view {
  display: grid;
  padding: 4px 8px 18px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 36px 48px;
}

.calendar-mini-month {
  min-width: 0;
  padding: 2px;
}

.calendar-tool .calendar-mini-month__title {
  display: inline-flex;
  min-height: 32px;
  margin: 0 0 12px;
  padding: 0 3px;
  border: 0;
  align-items: center;
  background: transparent;
  color: var(--calendar-holiday);
  cursor: pointer;
  font-size: 18px;
  font-weight: 700;
  text-align: left;
}

.calendar-tool .calendar-mini-month__title:hover {
  background: color-mix(in srgb, var(--calendar-holiday) 7%, transparent);
}

.calendar-mini-month__weekdays,
.calendar-mini-month__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.calendar-mini-month__weekdays {
  margin-bottom: 10px;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.calendar-mini-month__days {
  row-gap: 7px;
}

.calendar-mini-month__days button {
  position: relative;
  display: grid;
  min-width: 0;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  place-items: center;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
}

.calendar-mini-month__days button:hover {
  background: color-mix(in srgb, var(--tools-accent) 10%, transparent);
}

.calendar-mini-month__days button.is-outside {
  color: color-mix(in srgb, var(--color-text-muted) 42%, transparent);
  font-weight: 500;
}

.calendar-mini-month__days button.is-weekend:not(.is-today):not(.is-outside) {
  color: color-mix(in srgb, var(--color-text-muted) 84%, var(--color-text));
}

.calendar-mini-month__days button.is-today {
  width: 24px;
  margin-inline: auto;
  border-radius: 50%;
  background: var(--calendar-holiday);
  color: #fff;
  font-weight: 800;
}

.calendar-mini-month__days button.has-special:not(.is-today)::after {
  position: absolute;
  bottom: -2px;
  left: 50%;
  width: 13px;
  height: 1px;
  background: var(--calendar-holiday);
  content: '';
  transform: translateX(-50%);
}

.calendar-year-prompt {
  position: fixed;
  z-index: 1200;
  display: grid;
  width: min(290px, calc(100vw - 24px));
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  gap: 8px;
  background: color-mix(in srgb, var(--color-surface-solid) 94%, transparent);
  box-shadow: 0 16px 38px rgb(15 23 42 / 18%);
  color: var(--color-text);
  backdrop-filter: blur(18px);
}

.calendar-year-prompt header {
  display: flex;
  padding: 0 4px 4px;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text-muted);
  font-size: 10px;
}

.calendar-year-prompt header strong {
  color: var(--color-text);
  font-size: 11px;
}

.calendar-year-prompt__date {
  display: grid;
  gap: 5px;
}

.calendar-year-prompt__date > span {
  color: var(--color-text-muted);
  font-size: 10px;
}

.calendar-year-prompt__event {
  --calendar-event-tone: var(--calendar-event);
  display: grid;
  min-height: 34px;
  padding: 7px 9px;
  border-radius: 11px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  background: color-mix(in srgb, var(--calendar-event-tone) 10%, var(--color-surface-solid));
  font-size: 11px;
}

.calendar-year-prompt__event svg {
  color: var(--calendar-event-tone);
}

.calendar-year-prompt__event.is-dayoff,
.calendar-day-cell__event.is-dayoff {
  --calendar-event-tone: var(--calendar-holiday);
}

.calendar-year-prompt__event.is-workday,
.calendar-day-cell__event.is-workday {
  --calendar-event-tone: var(--calendar-workday);
}

.calendar-year-prompt__event.is-solar-term,
.calendar-day-cell__event.is-solar-term {
  --calendar-event-tone: var(--calendar-solar-term);
}

.calendar-year-prompt__event > span {
  color: var(--color-text-muted);
  font-size: 10px;
}

.calendar-year-prompt p {
  margin: 0;
  padding: 8px 4px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.calendar-month-view {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 11px;
}

.calendar-month-view__weekdays,
.calendar-month-view__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.calendar-month-view__grid {
  grid-auto-rows: minmax(clamp(132px, 13vw, 174px), auto);
}

.calendar-month-view__weekdays {
  min-height: 42px;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  background: color-mix(in srgb, var(--color-surface-soft) 72%, transparent);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 720;
  text-align: center;
}

.calendar-month-view__weekdays .is-weekend {
  color: var(--calendar-holiday);
}

.calendar-day-cell {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  padding: 8px;
  border: 0;
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  align-content: start;
  gap: 8px;
  background: var(--color-surface-solid);
  cursor: pointer;
  text-align: left;
}

.calendar-day-cell:nth-child(7n) {
  border-right: 0;
}

.calendar-day-cell:nth-last-child(-n + 7) {
  border-bottom: 0;
}

.calendar-day-cell:hover {
  z-index: 1;
  background: color-mix(in srgb, var(--tools-accent) 5%, var(--color-surface-solid));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tools-accent) 30%, transparent);
}

.calendar-day-cell.is-selected {
  z-index: 1;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tools-accent) 30%, transparent);
}

.calendar-day-cell.is-outside {
  background: color-mix(in srgb, var(--color-surface-soft) 72%, transparent);
  color: color-mix(in srgb, var(--color-text-muted) 72%, transparent);
}

.calendar-day-cell__header {
  display: flex;
  min-width: 0;
  min-height: 26px;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.calendar-day-cell__date-group {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
}

.calendar-day-cell__status {
  display: inline-grid;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  border-radius: 6px;
  place-items: center;
  font-size: 10px;
  font-weight: 800;
}

.calendar-day-cell__status.is-dayoff {
  background: color-mix(in srgb, var(--calendar-holiday) 13%, var(--color-surface-solid));
  color: var(--calendar-holiday);
}

.calendar-day-cell__status.is-workday {
  background: color-mix(in srgb, var(--calendar-workday) 14%, var(--color-surface-solid));
  color: var(--calendar-workday);
}

.calendar-day-cell__lunar,
.calendar-day-cell__date {
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-day-cell__lunar {
  color: var(--color-text-muted);
}

.calendar-day-cell__date {
  display: inline-grid;
  min-width: 28px;
  height: 28px;
  padding: 0 3px;
  place-items: center;
  border-radius: 999px;
  color: var(--color-text);
  font-size: 13px;
}

.calendar-day-cell.is-today .calendar-day-cell__date {
  background: var(--calendar-holiday);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--calendar-holiday) 24%, transparent);
  color: #fff;
}

.calendar-day-cell.is-weekend:not(.is-today) .calendar-day-cell__date {
  color: var(--calendar-holiday);
}

.calendar-day-cell.is-outside .calendar-day-cell__date,
.calendar-day-cell.is-outside .calendar-day-cell__lunar {
  color: color-mix(in srgb, var(--color-text-muted) 50%, transparent);
}

.calendar-day-cell__events {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.calendar-day-cell__event {
  --calendar-event-tone: var(--calendar-event);
  display: flex;
  min-width: 0;
  min-height: 23px;
  padding: 3px 7px;
  border-radius: 999px;
  align-items: center;
  gap: 5px;
  background: color-mix(in srgb, var(--calendar-event-tone) 18%, var(--color-surface-solid));
  color: color-mix(in srgb, var(--calendar-event-tone) 84%, var(--color-text));
  font-size: 10px;
  font-weight: 720;
  line-height: 1;
}

.calendar-day-cell__event svg {
  flex: 0 0 auto;
  color: var(--calendar-event-tone);
}

.calendar-day-cell__event span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-day-cell__more {
  padding-inline: 7px;
  color: var(--color-text-muted);
  font-size: 9px;
}

.calendar-week-view {
  display: grid;
  min-width: 0;
  overflow-x: auto;
  grid-template-columns: repeat(7, minmax(146px, 1fr));
  gap: 10px;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

.calendar-week-card {
  display: grid;
  min-height: 250px;
  padding: 18px 14px;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  align-content: start;
  justify-items: center;
  gap: 6px;
  background: color-mix(in srgb, var(--color-surface-soft) 45%, var(--color-surface-solid));
  cursor: pointer;
  text-align: center;
}

.calendar-week-card:hover,
.calendar-week-card.is-today {
  border-color: color-mix(in srgb, var(--tools-accent) 50%, var(--color-border));
  background: color-mix(in srgb, var(--tools-accent) 6%, var(--color-surface-solid));
}

.calendar-week-card.is-today {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tools-accent) 26%, transparent);
}

.calendar-week-card__weekday,
.calendar-week-card__month,
.calendar-week-card__lunar,
.calendar-week-card__empty {
  color: var(--color-text-muted);
  font-size: 10px;
}

.calendar-week-card.is-weekend .calendar-week-card__weekday {
  color: var(--calendar-holiday);
}

.calendar-week-card strong {
  display: grid;
  width: 58px;
  height: 58px;
  margin-top: 4px;
  border-radius: 50%;
  place-items: center;
  font-family: var(--font-display);
  font-size: 30px;
}

.calendar-week-card.is-today strong {
  background: var(--tools-accent);
  color: #fff;
}

.calendar-week-card__lunar {
  margin-top: 10px;
  line-height: 1.5;
}

.calendar-week-card__specials,
.calendar-day-hero__specials {
  display: flex;
  width: 100%;
  margin-top: 10px;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.calendar-week-card__specials span,
.calendar-day-hero__specials span {
  display: inline-flex;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  align-items: center;
  font-size: 10px;
  font-weight: 720;
}

.calendar-week-card__specials .is-holiday,
.calendar-day-hero__specials .is-holiday {
  background: color-mix(in srgb, var(--calendar-holiday) 10%, transparent);
  color: var(--calendar-holiday);
}

.calendar-week-card__specials .is-solar-term,
.calendar-day-hero__specials .is-solar-term {
  background: color-mix(in srgb, var(--calendar-solar-term) 10%, transparent);
  color: var(--calendar-solar-term);
}

.calendar-week-card__empty {
  margin-top: 16px;
}

.calendar-day-view {
  display: grid;
  grid-template-columns: minmax(280px, 0.85fr) minmax(320px, 1.15fr);
  gap: 14px;
}

.calendar-day-hero,
.calendar-day-details {
  min-width: 0;
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  background: color-mix(in srgb, var(--color-surface-soft) 50%, var(--color-surface-solid));
}

.calendar-day-hero {
  display: grid;
  min-height: 340px;
  padding: 28px;
  align-content: center;
  justify-items: center;
  text-align: center;
}

.calendar-day-hero > span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 720;
  letter-spacing: 0.12em;
}

.calendar-day-hero > strong {
  display: grid;
  width: 108px;
  height: 108px;
  margin: 10px 0 12px;
  border-radius: 50%;
  place-items: center;
  font-family: var(--font-display);
  font-size: 58px;
  line-height: 1;
}

.calendar-day-hero.is-today > strong {
  background: var(--tools-accent);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--tools-accent) 24%, transparent);
  color: #fff;
}

.calendar-day-hero h3 {
  margin: 0;
  font-size: 17px;
}

.calendar-day-hero p {
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 11px;
}

.calendar-day-details {
  display: grid;
  align-content: center;
}

.calendar-day-details > div {
  display: grid;
  min-height: 62px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--color-border);
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
}

.calendar-day-details > div:last-child {
  border-bottom: 0;
}

.calendar-day-details dt {
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 720;
}

.calendar-day-details dd {
  margin: 0;
  font-size: 12px;
  font-weight: 720;
}

.calendar-day-details dd.is-muted {
  color: var(--color-text-muted);
  font-weight: 500;
}

@media (max-width: 820px) {
  .calendar-toolbar {
    grid-template-areas:
      'title title'
      'navigation views';
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  .calendar-toolbar h2 {
    grid-area: title;
  }

  .calendar-toolbar__navigation {
    grid-area: navigation;
  }

  .calendar-toolbar__views {
    grid-area: views;
  }

  .calendar-month-view__grid {
    grid-auto-rows: minmax(98px, auto);
  }

  .calendar-year-view {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 28px 34px;
  }

  .calendar-day-cell {
    padding: 7px;
    gap: 4px;
  }

  .calendar-day-cell__lunar,
  .calendar-day-cell__date {
    font-size: 10px;
  }

  .calendar-day-cell__event {
    min-height: 20px;
    padding-inline: 5px;
    font-size: 9px;
  }

  .calendar-day-view {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .calendar-toolbar {
    padding: 10px;
  }

  .calendar-toolbar__views button {
    min-width: 36px;
    padding: 0 8px;
  }

  .calendar-toolbar__today {
    padding: 0 9px;
  }

  .calendar-tool__viewport {
    padding: 10px;
  }

  .calendar-year-view {
    grid-template-columns: minmax(0, 1fr);
    gap: 30px;
  }

  .calendar-mini-month__days button {
    height: 30px;
    font-size: 12px;
  }

  .calendar-month-view__weekdays {
    min-height: 32px;
  }

  .calendar-month-view__grid {
    grid-auto-rows: minmax(84px, auto);
  }

  .calendar-month-view__weekdays span {
    font-size: 0;
  }

  .calendar-month-view__weekdays span::after {
    font-size: 9px;
    content: attr(class);
  }

  .calendar-month-view__weekdays span:nth-child(1)::after {
    content: '一';
  }
  .calendar-month-view__weekdays span:nth-child(2)::after {
    content: '二';
  }
  .calendar-month-view__weekdays span:nth-child(3)::after {
    content: '三';
  }
  .calendar-month-view__weekdays span:nth-child(4)::after {
    content: '四';
  }
  .calendar-month-view__weekdays span:nth-child(5)::after {
    content: '五';
  }
  .calendar-month-view__weekdays span:nth-child(6)::after {
    content: '六';
  }
  .calendar-month-view__weekdays span:nth-child(7)::after {
    content: '日';
  }

  .calendar-day-cell {
    padding: 5px;
    gap: 1px;
  }

  .calendar-day-cell__header {
    min-height: 23px;
  }

  .calendar-day-cell__date-group {
    gap: 2px;
  }

  .calendar-day-cell__status {
    width: 17px;
    height: 17px;
    border-radius: 5px;
    font-size: 8px;
  }

  .calendar-day-cell__lunar,
  .calendar-day-cell__date {
    font-size: 8px;
  }

  .calendar-day-cell__date {
    min-width: 23px;
    height: 23px;
  }

  .calendar-day-cell__event {
    min-height: 18px;
    padding: 2px 4px;
    gap: 3px;
    font-size: 8px;
  }

  .calendar-day-cell__event svg {
    width: 10px;
    height: 10px;
  }

  .calendar-day-hero {
    min-height: 300px;
    padding: 22px;
  }

  .calendar-day-details > div {
    grid-template-columns: 58px minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .calendar-tool * {
    scroll-behavior: auto !important;
  }
}
</style>
