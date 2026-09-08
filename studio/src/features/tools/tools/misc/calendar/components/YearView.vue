<script setup lang="ts">
import { IconStarFilled } from '@tabler/icons-vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  getDaySpecialItems,
  getDayTooltip,
  isSupportedDate,
  WEEKDAY_SHORT,
} from '../calendar-date.util';
import type { CalendarDay, CalendarMonth, CalendarPreferences, DateKey } from '../types';

const props = defineProps<{
  months: CalendarMonth[];
  selectedKey: DateKey;
  preferences: CalendarPreferences;
}>();
const weekdays = computed(() =>
  props.preferences.weekStartsOn === 0 ? ['日', ...WEEKDAY_SHORT.slice(0, 6)] : WEEKDAY_SHORT,
);

const emit = defineEmits<{
  'open-month': [year: number, month: number];
  'select-date': [date: Date];
  'open-day': [date: Date];
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

const promptKey = ref<DateKey | null>(null);
const promptDay = computed(() =>
  props.months.flatMap((month) => month.days).find((day) => day.key === promptKey.value),
);
const promptElement = ref<HTMLElement | null>(null);
const promptPosition = ref({ left: 0, top: 0 });
let promptOrigin: HTMLElement | null = null;

function dayClasses(day: CalendarDay): Record<string, boolean> {
  return {
    'is-outside': !day.isCurrentMonth,
    'is-today': day.isToday,
    'is-weekend': day.isWeekend,
    'is-selected': day.key === props.selectedKey,
    'has-special': getDaySpecialItems(day, props.preferences).length > 0,
  };
}

function showDayPrompt(day: CalendarDay, target: HTMLElement): void {
  promptOrigin = target;
  const rect = target.getBoundingClientRect();
  const promptWidth = Math.min(290, window.innerWidth - 24);
  const preferredLeft = rect.left + rect.width / 2 - promptWidth / 2;
  promptPosition.value = {
    left: Math.max(12, Math.min(preferredLeft, window.innerWidth - promptWidth - 12)),
    top: Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - 240)),
  };
  promptKey.value = day.key;
}

function handleDayClick(day: CalendarDay, event: MouseEvent): void {
  emit('select-date', day.date);
  showDayPrompt(day, event.currentTarget as HTMLElement);
}

function handleDayDoubleClick(day: CalendarDay): void {
  promptKey.value = null;
  emit('open-month', day.year, day.month);
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!promptDay.value || promptElement.value?.contains(event.target as Node)) return;
  promptKey.value = null;
}

function closePrompt(): void {
  promptKey.value = null;
}

function dismissPrompt(): void {
  closePrompt();
  if (promptOrigin?.isConnected) promptOrigin.focus({ preventScroll: true });
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && promptKey.value) dismissPrompt();
}

watch(
  () => props.selectedKey,
  (key) => {
    if (key !== promptKey.value) closePrompt();
  },
);

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('resize', closePrompt);
  window.addEventListener('scroll', closePrompt, true);
  window.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  window.removeEventListener('resize', closePrompt);
  window.removeEventListener('scroll', closePrompt, true);
  window.removeEventListener('keydown', handleEscape);
});
</script>

<template>
  <div class="calendar-year-view">
    <article v-for="month in months" :key="month.month" class="calendar-mini-month">
      <button
        type="button"
        class="calendar-mini-month__title"
        :aria-label="`查看 ${month.year} 年 ${month.month} 月`"
        @click="emit('open-month', month.year, month.month)"
      >
        {{ MONTH_NAMES[month.month - 1] }}
      </button>
      <div class="calendar-mini-month__weekdays" aria-hidden="true">
        <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
      </div>
      <div class="calendar-mini-month__days">
        <button
          v-for="day in month.days"
          :key="day.key"
          type="button"
          :class="dayClasses(day)"
          :data-calendar-date="day.key"
          :data-current-month="day.isCurrentMonth"
          :disabled="!day.isCurrentMonth || !isSupportedDate(day.date)"
          :tabindex="selectedKey === day.key && day.isCurrentMonth ? 0 : -1"
          :aria-pressed="selectedKey === day.key"
          :aria-current="day.isToday ? 'date' : undefined"
          :title="getDayTooltip(day)"
          :aria-label="`${getDayTooltip(day)}，双击查看月视图`"
          @click.stop="handleDayClick(day, $event)"
          @dblclick.stop="handleDayDoubleClick(day)"
        >
          {{ day.day }}
          <span
            v-if="day.dayStatus && day.isCurrentMonth"
            class="calendar-mini-status"
            :class="`is-${day.dayStatus}`"
            >{{ day.dayStatus === 'dayoff' ? '休' : '班' }}</span
          >
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
          <span v-if="preferences.showLunar"
            >农历 {{ promptDay.lunar.lunarMonth }}{{ promptDay.lunar.lunarDay }}</span
          >
        </div>
        <span>{{ promptDay.weekdayText }}</span>
      </header>
      <div
        v-for="item in getDaySpecialItems(promptDay, preferences)"
        :key="item.id"
        class="calendar-year-prompt__event"
        :class="`is-${item.tone}`"
      >
        <IconStarFilled :size="15" aria-hidden="true" />
        <strong>{{ item.title }}</strong>
        <span>全天</span>
      </div>
      <p v-if="getDaySpecialItems(promptDay, preferences).length === 0">当日无节日或节气</p>
      <footer class="calendar-year-prompt__actions">
        <button type="button" @click="emit('open-day', promptDay.date)">查看日视图</button>
        <button type="button" @click="dismissPrompt">关闭</button>
      </footer>
    </section>
  </Teleport>
</template>
