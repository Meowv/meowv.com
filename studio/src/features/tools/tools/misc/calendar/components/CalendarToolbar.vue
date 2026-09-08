<script setup lang="ts">
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconRefresh } from '@tabler/icons-vue';
import { ref } from 'vue';
import { CALENDAR_VIEWS, type CalendarPanel, type CalendarView } from '../types';

defineProps<{
  currentView: CalendarView;
  title: string;
  holidayLoading: boolean;
  holidayError: string | null;
  canGoPrevious: boolean;
  canGoNext: boolean;
}>();

const emit = defineEmits<{
  previous: [];
  next: [];
  today: [];
  retry: [];
  'update:view': [view: CalendarView];
  'open-panel': [panel: CalendarPanel];
}>();

const menu = ref<HTMLDetailsElement | null>(null);
const viewNames: Record<CalendarView, string> = { year: '年', month: '月', week: '周', day: '日' };
const panels: { id: CalendarPanel; title: string }[] = [
  { id: 'holidays', title: '全年假期' },
  { id: 'countdown', title: '假期与节日倒计时' },
  { id: 'range', title: '日期区间计算' },
  { id: 'lunar', title: '公历 / 农历互查' },
  { id: 'solar', title: '全年节气' },
  { id: 'preferences', title: '显示设置' },
  { id: 'sources', title: '数据来源' },
];

function openPanel(panel: CalendarPanel): void {
  if (menu.value) menu.value.open = false;
  menu.value?.querySelector('summary')?.focus();
  emit('open-panel', panel);
}

function closeMenu(event: FocusEvent): void {
  if (!menu.value?.contains(event.relatedTarget as Node | null) && menu.value)
    menu.value.open = false;
}
</script>

<template>
  <div class="calendar-toolbar">
    <div class="calendar-toolbar__navigation">
      <div class="calendar-toolbar__arrows">
        <button
          type="button"
          title="上一周期"
          aria-label="上一周期"
          :disabled="!canGoPrevious"
          @click="emit('previous')"
        >
          <IconChevronLeft :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="下一周期"
          aria-label="下一周期"
          :disabled="!canGoNext"
          @click="emit('next')"
        >
          <IconChevronRight :size="18" aria-hidden="true" />
        </button>
      </div>
      <button type="button" class="calendar-toolbar__today" @click="emit('today')">今天</button>
    </div>
    <h2>
      <button
        type="button"
        class="calendar-toolbar__title"
        title="跳转日期"
        aria-label="跳转日期"
        @click="emit('open-panel', 'jump')"
      >
        {{ title }}
        <IconChevronDown class="calendar-toolbar__title-chevron" aria-hidden="true" />
      </button>
    </h2>
    <div class="calendar-toolbar__actions">
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
      <details
        ref="menu"
        class="calendar-more"
        @focusout="closeMenu"
        @keydown.esc.prevent="menu && (menu.open = false)"
      >
        <summary aria-label="更多日历功能">更多</summary>
        <div class="calendar-more__menu">
          <button v-for="item in panels" :key="item.id" type="button" @click="openPanel(item.id)">
            {{ item.title }}
          </button>
        </div>
      </details>
    </div>
  </div>
  <div v-if="holidayLoading || holidayError" class="calendar-source-status" role="status">
    <span v-if="holidayLoading">正在更新休班安排…</span>
    <template v-else
      ><span>{{ holidayError }}</span
      ><button type="button" @click="emit('retry')">
        <IconRefresh :size="14" aria-hidden="true" />重试
      </button></template
    >
  </div>
</template>
