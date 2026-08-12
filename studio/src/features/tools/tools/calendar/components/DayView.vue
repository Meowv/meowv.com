<script setup lang="ts">
import type { CalendarDay } from '../types';

defineProps<{ day: CalendarDay }>();
</script>

<template>
  <div class="calendar-day-view">
    <div class="calendar-day-hero" :class="{ 'is-today': day.isToday }">
      <span>{{ day.year }}</span>
      <strong>{{ day.day }}</strong>
      <h3>{{ day.month }} 月 · {{ day.weekdayText }}</h3>
      <p>农历 {{ day.lunar.lunarMonth }}{{ day.lunar.lunarDay }}</p>
      <div v-if="day.holidays.length || day.lunar.solarTerm" class="calendar-day-hero__specials">
        <span v-for="holiday in day.holidays" :key="holiday.id" class="is-holiday">
          {{ holiday.title }}
        </span>
        <span v-if="day.lunar.solarTerm" class="is-solar-term">{{ day.lunar.solarTerm }}</span>
      </div>
    </div>

    <dl class="calendar-day-details">
      <div>
        <dt>公历</dt>
        <dd>{{ day.year }} 年 {{ day.month }} 月 {{ day.day }} 日</dd>
      </div>
      <div>
        <dt>星期</dt>
        <dd>{{ day.weekdayText }}</dd>
      </div>
      <div>
        <dt>农历</dt>
        <dd>{{ day.lunar.fullText }}</dd>
      </div>
      <div>
        <dt>节气</dt>
        <dd :class="{ 'is-muted': !day.lunar.solarTerm }">{{ day.lunar.solarTerm || '—' }}</dd>
      </div>
      <div>
        <dt>节日</dt>
        <dd :class="{ 'is-muted': !day.holidays.length }">
          {{ day.holidays.map((holiday) => holiday.title).join('、') || '—' }}
        </dd>
      </div>
    </dl>
  </div>
</template>
