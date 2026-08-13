<script setup lang="ts">
import { getDayTooltip } from '../calendar-date.util';
import type { CalendarDay } from '../types';

defineProps<{ days: CalendarDay[] }>();

const emit = defineEmits<{
  'select-date': [date: Date];
}>();
</script>

<template>
  <div class="calendar-week-view">
    <button
      v-for="day in days"
      :key="day.key"
      type="button"
      class="calendar-week-card"
      :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
      :title="getDayTooltip(day)"
      @click="emit('select-date', day.date)"
    >
      <span class="calendar-week-card__weekday">{{ day.weekdayText }}</span>
      <strong>{{ day.day }}</strong>
      <span class="calendar-week-card__month">{{ day.month }} 月</span>
      <span class="calendar-week-card__lunar">
        农历 {{ day.lunar.lunarMonth }}{{ day.lunar.lunarDay }}
      </span>
      <span v-if="day.holidays.length || day.lunar.solarTerm" class="calendar-week-card__specials">
        <span v-for="holiday in day.holidays" :key="holiday.id" class="is-holiday">
          {{ holiday.title }}
        </span>
        <span v-if="day.lunar.solarTerm" class="is-solar-term">{{ day.lunar.solarTerm }}</span>
      </span>
      <span v-else class="calendar-week-card__empty">无节日或节气</span>
    </button>
  </div>
</template>
