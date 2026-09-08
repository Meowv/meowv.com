<script setup lang="ts">
import { computed } from 'vue';
import {
  getDaySpecialItems,
  getDayTooltip,
  getIsoWeekNumber,
  getIsoWeekYear,
  isSupportedDate,
  WEEKDAY_SHORT,
} from '../calendar-date.util';
import type { CalendarDay, CalendarPreferences, DateKey } from '../types';

const props = defineProps<{
  days: CalendarDay[];
  selectedKey: DateKey;
  preferences: CalendarPreferences;
}>();
const emit = defineEmits<{ 'open-day': [date: Date]; 'select-date': [date: Date] }>();
const weekdays = computed(() =>
  props.preferences.weekStartsOn === 0 ? ['日', ...WEEKDAY_SHORT.slice(0, 6)] : WEEKDAY_SHORT,
);
const visibleDays = computed(() =>
  props.days.map((day) => ({ day, items: getDaySpecialItems(day, props.preferences) })),
);
</script>

<template>
  <div class="calendar-month-view" :data-density="preferences.monthDensity">
    <div class="calendar-month-view__weekdays" aria-hidden="true">
      <span
        v-for="weekday in weekdays"
        :key="weekday"
        :class="{ 'is-weekend': weekday === '六' || weekday === '日' }"
        >周{{ weekday }}</span
      >
    </div>
    <div class="calendar-month-view__grid" aria-label="月历日期">
      <button
        v-for="({ day, items }, index) in visibleDays"
        :key="day.key"
        type="button"
        class="calendar-day-cell"
        :class="{
          'is-outside': !day.isCurrentMonth,
          'is-today': day.isToday,
          'is-weekend': day.isWeekend,
          'is-selected': selectedKey === day.key,
          'has-week-number': preferences.showWeekNumbers && preferences.weekStartsOn === 1,
        }"
        :data-calendar-date="day.key"
        :data-current-month="day.isCurrentMonth"
        :disabled="!isSupportedDate(day.date)"
        :tabindex="selectedKey === day.key ? 0 : -1"
        :aria-current="day.isToday ? 'date' : undefined"
        :aria-pressed="selectedKey === day.key"
        :title="getDayTooltip(day)"
        :aria-label="getDayTooltip(day)"
        @click="emit('select-date', day.date)"
        @dblclick="emit('open-day', day.date)"
      >
        <span
          v-if="preferences.showWeekNumbers && preferences.weekStartsOn === 1 && index % 7 === 0"
          class="calendar-day-cell__week"
          :title="`${getIsoWeekYear(day.date)} 年第 ${getIsoWeekNumber(day.date)} 周`"
          >W{{ getIsoWeekNumber(day.date) }}</span
        >
        <span class="calendar-day-cell__header">
          <span v-if="preferences.showLunar" class="calendar-day-cell__lunar">{{
            day.lunar.shortText
          }}</span>
          <span class="calendar-day-cell__date-group">
            <span
              v-if="day.dayStatus"
              class="calendar-day-cell__status"
              :class="`is-${day.dayStatus}`"
              >{{ day.dayStatus === 'dayoff' ? '休' : '班' }}</span
            >
            <span class="calendar-day-cell__date"
              >{{ day.day }}<span class="calendar-date-suffix">日</span></span
            >
          </span>
        </span>
        <span class="calendar-day-cell__compact-label">{{
          preferences.showSolarTerms && day.lunar.solarTerm
            ? day.lunar.solarTerm
            : preferences.showLunar
              ? day.lunar.shortText
              : ''
        }}</span>
        <span class="calendar-day-cell__events">
          <span
            v-for="item in items.slice(0, 3)"
            :key="item.id"
            class="calendar-day-cell__event"
            :class="`is-${item.tone}`"
            ><span>{{ item.title }}</span></span
          >
          <span v-if="items.length > 3" class="calendar-day-cell__more"
            >+{{ items.length - 3 }}</span
          >
        </span>
        <span v-if="items.length" class="calendar-day-cell__special-dot" aria-hidden="true"></span>
      </button>
    </div>
  </div>
</template>
