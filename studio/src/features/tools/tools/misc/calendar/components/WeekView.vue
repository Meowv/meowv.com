<script setup lang="ts">
import { computed } from 'vue';
import { getDaySpecialItems, getDayTooltip, isSupportedDate } from '../calendar-date.util';
import type { CalendarDay, CalendarPreferences, DateKey } from '../types';
const props = defineProps<{
  days: CalendarDay[];
  selectedKey: DateKey;
  preferences: CalendarPreferences;
}>();
const emit = defineEmits<{ 'select-date': [date: Date] }>();
const visibleDays = computed(() =>
  props.days.map((day) => ({ day, items: getDaySpecialItems(day, props.preferences) })),
);
</script>

<template>
  <div class="calendar-week-view" aria-label="周历日期">
    <button
      v-for="{ day, items } in visibleDays"
      :key="day.key"
      type="button"
      class="calendar-week-card"
      :class="{
        'is-today': day.isToday,
        'is-weekend': day.isWeekend,
        'is-selected': selectedKey === day.key,
      }"
      :data-calendar-date="day.key"
      data-current-month="true"
      :tabindex="selectedKey === day.key ? 0 : -1"
      :disabled="!isSupportedDate(day.date)"
      :aria-current="day.isToday ? 'date' : undefined"
      :aria-pressed="selectedKey === day.key"
      :title="getDayTooltip(day)"
      :aria-label="getDayTooltip(day)"
      @click="emit('select-date', day.date)"
    >
      <span class="calendar-week-card__weekday"
        >{{ day.weekdayText }}
        <span
          v-if="day.dayStatus"
          class="calendar-day-cell__status"
          :class="`is-${day.dayStatus}`"
          >{{ day.dayStatus === 'dayoff' ? '休' : '班' }}</span
        ></span
      >
      <strong>{{ day.day }}</strong>
      <span class="calendar-week-card__month">{{ day.month }} 月</span>
      <span v-if="preferences.showLunar" class="calendar-week-card__lunar"
        >农历 {{ day.lunar.lunarMonth }}{{ day.lunar.lunarDay }}</span
      >
      <span v-if="items.length" class="calendar-week-card__specials"
        ><span v-for="item in items" :key="item.id" :class="`is-${item.tone}`">{{
          item.title
        }}</span></span
      >
      <span v-else class="calendar-week-card__empty">无节日或节气</span>
    </button>
  </div>
</template>
