<script setup lang="ts">
import { computed } from 'vue';
import {
  addDays,
  dateDistance,
  formatDateKey,
  getDaySpecialItems,
  parseDateKey,
} from '../calendar-date.util';
import type { CalendarCoverage, CalendarDay, CalendarPreferences } from '../types';

const props = defineProps<{
  day: CalendarDay;
  preferences: CalendarPreferences;
  coverage: CalendarCoverage;
  compact?: boolean;
}>();
const items = computed(() => getDaySpecialItems(props.day, props.preferences));
const periods = computed(() => [
  ...new Map(
    props.day.holidays.flatMap((event) =>
      event.period ? [[event.period.id, event.period] as const] : [],
    ),
  ).values(),
]);
const status = computed(() => {
  if (props.day.dayStatus === 'dayoff') return '放假休息';
  if (props.day.dayStatus === 'workday') return '调休上班';
  if (props.coverage !== 'complete')
    return props.day.isWeekend ? '周末 · 休班安排未完整收录' : '休班安排未完整收录';
  return props.day.isWeekend ? '周末休息' : '正常工作日';
});
function inclusiveEnd(value: string): string {
  const date = parseDateKey(value);
  return date ? formatDateKey(addDays(date, -1)) : value;
}
</script>

<template>
  <div class="calendar-day-view" :class="{ 'is-compact': compact }">
    <div v-if="!compact" class="calendar-day-hero" :class="{ 'is-today': day.isToday }">
      <span>{{ day.year }}</span
      ><strong>{{ day.day }}</strong>
      <h3>{{ day.month }} 月 · {{ day.weekdayText }}</h3>
      <p v-if="preferences.showLunar">农历 {{ day.lunar.lunarMonth }}{{ day.lunar.lunarDay }}</p>
      <div v-if="items.length" class="calendar-day-hero__specials">
        <span v-for="item in items" :key="item.id" :class="`is-${item.tone}`">{{
          item.title
        }}</span>
      </div>
    </div>
    <dl class="calendar-day-details">
      <div>
        <dt>公历</dt>
        <dd>{{ day.year }} 年 {{ day.month }} 月 {{ day.day }} 日 · {{ day.weekdayText }}</dd>
      </div>
      <div v-if="preferences.showLunar">
        <dt>农历</dt>
        <dd>{{ day.lunar.fullText }}</dd>
      </div>
      <div>
        <dt>休班安排</dt>
        <dd :class="{ 'is-muted': coverage !== 'complete' && !day.dayStatus }">{{ status }}</dd>
      </div>
      <div v-if="preferences.showSolarTerms">
        <dt>节气</dt>
        <dd :class="{ 'is-muted': !day.lunar.solarTerm }">{{ day.lunar.solarTerm || '—' }}</dd>
      </div>
      <div>
        <dt>节日</dt>
        <dd :class="{ 'is-muted': !day.lunar.festivals.length }">
          {{ day.lunar.festivals.join('、') || '—' }}
        </dd>
      </div>
      <div v-for="period in periods" :key="period.id">
        <dt>{{ day.dayStatus === 'workday' ? '对应假期' : '假期详情' }}</dt>
        <dd>
          <span class="calendar-period-line"
            >{{ period.title }} · {{ period.startDate }} — {{ inclusiveEnd(period.endDate) }}</span
          >
          <span v-if="day.dayStatus === 'dayoff'" class="calendar-period-line"
            >第 {{ dateDistance(period.startDate, day.key) + 1 }} 天 / 共
            {{ dateDistance(period.startDate, period.endDate) }} 天</span
          >
          <span v-if="period.compDays.length" class="calendar-period-line"
            >补班：{{ period.compDays.join('、') }}</span
          >
        </dd>
      </div>
      <div v-if="day.holidays.length && !periods.length">
        <dt>已收录安排</dt>
        <dd>{{ day.holidays.map((event) => event.title).join('、') }}</dd>
      </div>
    </dl>
  </div>
</template>
