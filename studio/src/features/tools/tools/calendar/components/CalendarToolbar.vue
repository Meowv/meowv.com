<script setup lang="ts">
import { IconChevronLeft, IconChevronRight, IconRefresh } from '@tabler/icons-vue';
import { CALENDAR_VIEWS, type CalendarView } from '../types';

defineProps<{
  currentView: CalendarView;
  title: string;
  holidayLoading: boolean;
  holidayError: string | null;
}>();

const emit = defineEmits<{
  previous: [];
  next: [];
  today: [];
  retry: [];
  'update:view': [view: CalendarView];
}>();

const viewNames: Record<CalendarView, string> = {
  year: '年',
  month: '月',
  week: '周',
  day: '日',
};
</script>

<template>
  <div class="calendar-toolbar">
    <div class="calendar-toolbar__navigation">
      <div class="calendar-toolbar__arrows">
        <button type="button" title="上一周期" aria-label="上一周期" @click="emit('previous')">
          <IconChevronLeft :size="18" aria-hidden="true" />
        </button>
        <button type="button" title="下一周期" aria-label="下一周期" @click="emit('next')">
          <IconChevronRight :size="18" aria-hidden="true" />
        </button>
      </div>
      <button type="button" class="calendar-toolbar__today" @click="emit('today')">今天</button>
    </div>

    <h2>{{ title }}</h2>

    <div class="calendar-toolbar__views" aria-label="日历视图">
      <button
        v-for="view in CALENDAR_VIEWS"
        :key="view"
        type="button"
        :class="{ 'is-active': currentView === view }"
        :aria-pressed="currentView === view"
        @click="emit('update:view', view)"
      >
        {{ viewNames[view] }}
      </button>
    </div>
  </div>

  <div v-if="holidayLoading || holidayError" class="calendar-source-status" role="status">
    <span v-if="holidayLoading">正在加载节日…</span>
    <template v-else>
      <span>{{ holidayError }}</span>
      <button type="button" @click="emit('retry')">
        <IconRefresh :size="14" aria-hidden="true" />
        重试
      </button>
    </template>
  </div>
</template>
