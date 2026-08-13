<script setup lang="ts">
import { IconStarFilled } from '@tabler/icons-vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { getDaySpecialItems, getDayTooltip, WEEKDAY_SHORT } from '../calendar-date.util';
import type { CalendarDay, CalendarMonth } from '../types';

defineProps<{ months: CalendarMonth[] }>();

const emit = defineEmits<{
  'open-month': [year: number, month: number];
}>();

const MONTH_NAMES = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
] as const;

const promptDay = ref<CalendarDay | null>(null);
const promptElement = ref<HTMLElement | null>(null);
const promptPosition = ref({ left: 0, top: 0 });
let clickTimer: number | null = null;

function dayClasses(day: CalendarDay): Record<string, boolean> {
  return {
    'is-outside': !day.isCurrentMonth,
    'is-today': day.isToday,
    'is-weekend': day.isWeekend,
    'has-special': getDaySpecialItems(day).length > 0,
  };
}

function cancelPendingClick(): void {
  if (clickTimer === null) return;
  window.clearTimeout(clickTimer);
  clickTimer = null;
}

function showDayPrompt(day: CalendarDay, target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const promptWidth = Math.min(290, window.innerWidth - 24);
  const preferredLeft = rect.left + rect.width / 2 - promptWidth / 2;
  promptPosition.value = {
    left: Math.max(12, Math.min(preferredLeft, window.innerWidth - promptWidth - 12)),
    top: Math.min(rect.bottom + 10, window.innerHeight - 150),
  };
  promptDay.value = day;
}

function handleDayClick(day: CalendarDay, event: MouseEvent): void {
  cancelPendingClick();
  const target = event.currentTarget as HTMLElement;
  clickTimer = window.setTimeout(() => {
    showDayPrompt(day, target);
    clickTimer = null;
  }, 220);
}

function handleDayDoubleClick(day: CalendarDay): void {
  cancelPendingClick();
  promptDay.value = null;
  emit('open-month', day.year, day.month);
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!promptDay.value || promptElement.value?.contains(event.target as Node)) return;
  promptDay.value = null;
}

function closePrompt(): void {
  promptDay.value = null;
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('resize', closePrompt);
  window.addEventListener('scroll', closePrompt, true);
});

onBeforeUnmount(() => {
  cancelPendingClick();
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  window.removeEventListener('resize', closePrompt);
  window.removeEventListener('scroll', closePrompt, true);
});
</script>

<template>
  <div class="calendar-year-view">
    <article v-for="month in months" :key="month.month" class="calendar-mini-month">
      <button
        type="button"
        class="calendar-mini-month__title"
        :aria-label="`双击查看 ${month.year} 年 ${month.month} 月`"
        @dblclick="emit('open-month', month.year, month.month)"
      >
        {{ MONTH_NAMES[month.month - 1] }}
      </button>
      <div class="calendar-mini-month__weekdays" aria-hidden="true">
        <span v-for="weekday in WEEKDAY_SHORT" :key="weekday">{{ weekday }}</span>
      </div>
      <div class="calendar-mini-month__days">
        <button
          v-for="day in month.days"
          :key="day.key"
          type="button"
          :class="dayClasses(day)"
          :title="getDayTooltip(day)"
          :aria-label="`${getDayTooltip(day)}，双击查看月视图`"
          @click.stop="handleDayClick(day, $event)"
          @dblclick.stop="handleDayDoubleClick(day)"
        >
          {{ day.day }}
        </button>
      </div>
    </article>
  </div>

  <Teleport to="body">
    <section
      v-if="promptDay"
      ref="promptElement"
      class="calendar-year-prompt"
      :style="{ left: `${promptPosition.left}px`, top: `${promptPosition.top}px` }"
      role="dialog"
      :aria-label="`${promptDay.month} 月 ${promptDay.day} 日信息`"
      @pointerdown.stop
    >
      <header>
        <div class="calendar-year-prompt__date">
          <strong>{{ promptDay.month }} 月 {{ promptDay.day }} 日</strong>
          <span>农历 {{ promptDay.lunar.lunarMonth }}{{ promptDay.lunar.lunarDay }}</span>
        </div>
        <span>{{ promptDay.weekdayText }}</span>
      </header>
      <div
        v-for="item in getDaySpecialItems(promptDay)"
        :key="item.id"
        class="calendar-year-prompt__event"
        :class="`is-${item.tone}`"
      >
        <IconStarFilled :size="15" aria-hidden="true" />
        <strong>{{ item.title }}</strong>
        <span>全天</span>
      </div>
      <p v-if="getDaySpecialItems(promptDay).length === 0">当日无节假日或节气</p>
    </section>
  </Teleport>
</template>
