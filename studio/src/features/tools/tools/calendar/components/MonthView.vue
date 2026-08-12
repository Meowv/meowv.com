<script setup lang="ts">
import { IconStarFilled } from '@tabler/icons-vue';
import { ref } from 'vue';
import { getDaySpecialItems, getDayTooltip, WEEKDAY_SHORT } from '../calendar-date.util';
import type { CalendarDay } from '../types';

defineProps<{ days: CalendarDay[] }>();

const emit = defineEmits<{
  'open-day': [date: Date];
}>();

const selectedKey = ref<string | null>(null);

function formatSolarDate(day: CalendarDay): string {
  return day.isCurrentMonth ? `${day.day} 日` : `${day.month} 月 ${day.day} 日`;
}
</script>

<template>
  <div class="calendar-month-view">
    <div class="calendar-month-view__weekdays" aria-hidden="true">
      <span
        v-for="(weekday, index) in WEEKDAY_SHORT"
        :key="weekday"
        :class="{ 'is-weekend': index >= 5 }"
      >
        周{{ weekday }}
      </span>
    </div>

    <div class="calendar-month-view__grid">
      <button
        v-for="day in days"
        :key="day.key"
        type="button"
        class="calendar-day-cell"
        :class="{
          'is-outside': !day.isCurrentMonth,
          'is-today': day.isToday,
          'is-weekend': day.isWeekend,
          'is-selected': selectedKey === day.key,
        }"
        :title="`${getDayTooltip(day)}\n双击查看日视图`"
        :aria-label="`${getDayTooltip(day)}，双击查看日视图`"
        @click="selectedKey = day.key"
        @dblclick="emit('open-day', day.date)"
      >
        <span class="calendar-day-cell__header">
          <span class="calendar-day-cell__lunar">{{ day.lunar.shortText }}</span>
          <span class="calendar-day-cell__date-group">
            <span
              v-if="day.dayStatus"
              class="calendar-day-cell__status"
              :class="`is-${day.dayStatus}`"
            >
              {{ day.dayStatus === 'dayoff' ? '休' : '班' }}
            </span>
            <span class="calendar-day-cell__date">{{ formatSolarDate(day) }}</span>
          </span>
        </span>

        <span class="calendar-day-cell__events">
          <span
            v-for="item in getDaySpecialItems(day).slice(0, 3)"
            :key="item.id"
            class="calendar-day-cell__event"
            :class="`is-${item.tone}`"
          >
            <IconStarFilled :size="14" aria-hidden="true" />
            <span>{{ item.title }}</span>
          </span>
          <span v-if="getDaySpecialItems(day).length > 3" class="calendar-day-cell__more">
            +{{ getDaySpecialItems(day).length - 3 }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
