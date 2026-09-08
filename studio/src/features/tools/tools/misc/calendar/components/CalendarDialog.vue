<script setup lang="ts">
import { IconChevronDown } from '@tabler/icons-vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { Solar } from 'lunar-javascript';
import {
  MAX_CALENDAR_YEAR,
  MIN_CALENDAR_YEAR,
  dateDistance,
  formatDateKey,
  parseDateKey,
} from '../calendar-date.util';
import {
  calculateDateRange,
  convertLunarToSolar,
  getHolidayCountdown,
  getHolidayPeriods,
  getLunarMonths,
  getUpcomingFestival,
  getYearSolarTerms,
} from '../calendar-query.util';
import { getLunarDateInfo } from '../lunar.service';
import type {
  CalendarCoverage,
  CalendarPanel,
  CalendarPreferences,
  DateKey,
  HolidayEvent,
  HolidaySnapshot,
  HolidaySourceId,
} from '../types';

const props = defineProps<{
  panel: CalendarPanel;
  selectedDate: Date;
  today: Date;
  events: HolidayEvent[];
  coverage: Record<number, CalendarCoverage>;
  sourcesByYear: Partial<Record<number, HolidaySourceId>>;
  snapshots: HolidaySnapshot[];
  errors: Partial<Record<HolidaySourceId, string>>;
  loading: boolean;
  preferences: CalendarPreferences;
}>();

const emit = defineEmits<{
  close: [];
  'select-date': [date: Date];
  'update:preferences': [value: Partial<CalendarPreferences>];
  refresh: [];
}>();

const panelLabels: Record<CalendarPanel, { title: string }> = {
  jump: { title: '跳转日期' },
  holidays: { title: '全年假期' },
  countdown: { title: '假期与节日倒计时' },
  range: { title: '日期区间计算' },
  lunar: { title: '公历与农历互查' },
  solar: { title: '二十四节气' },
  preferences: { title: '显示偏好' },
  sources: { title: '数据来源' },
};
const sourceNames: Record<HolidaySourceId, string> = {
  lanceliao: 'lanceliao · 中国节假日',
  muhac: 'muhac · 放假与补班',
};
const sourceIds: HolidaySourceId[] = ['lanceliao', 'muhac'];
const coverageLabels: Record<CalendarCoverage, string> = {
  complete: '完整',
  partial: '部分',
  unavailable: '未收录',
};
const seasons = ['春', '夏', '秋', '冬'] as const;
const inputId = `calendar-query-${useId()}`;
const dialog = ref<HTMLDialogElement | null>(null);
const keyboardNavigation = ref(false);
let pointerStartedOnBackdrop = false;
const label = computed(() => panelLabels[props.panel]);
const years = Array.from(
  { length: MAX_CALENDAR_YEAR - MIN_CALENDAR_YEAR + 1 },
  (_, index) => MIN_CALENDAR_YEAR + index,
);
const lunarYears = [MIN_CALENDAR_YEAR - 1, ...years];
const minDate = `${MIN_CALENDAR_YEAR}-01-01`;
const maxDate = `${MAX_CALENDAR_YEAR}-12-31`;
const supportedRange = `${MIN_CALENDAR_YEAR}—${MAX_CALENDAR_YEAR} 年`;
const queryYear = ref(props.selectedDate.getFullYear());
const jumpYear = ref(props.selectedDate.getFullYear());
const jumpMonth = ref(props.selectedDate.getMonth() + 1);
const jumpDate = ref(formatDateKey(props.selectedDate));
const rangeStart = ref(formatDateKey(props.selectedDate));
const rangeEnd = ref(formatDateKey(props.selectedDate));
const includeStart = ref(true);
const includeEnd = ref(true);
const solarDate = ref(formatDateKey(props.selectedDate));
const initialLunarDate = Solar.fromYmd(
  props.selectedDate.getFullYear(),
  props.selectedDate.getMonth() + 1,
  props.selectedDate.getDate(),
).getLunar();
const lunarYear = ref(initialLunarDate.getYear());
const lunarMonth = ref(initialLunarDate.getMonth());
const lunarDay = ref(initialLunarDate.getDay());
const inspectedAt = ref(Date.now());
const todayKey = computed(() => formatDateKey(props.today));
const showYearPicker = computed(() => ['holidays', 'solar', 'sources'].includes(props.panel));
const yearCoverage = computed(() => props.coverage[queryYear.value] ?? 'unavailable');
const selectedSource = computed(() => props.sourcesByYear[queryYear.value]);
let opener: HTMLElement | null = null;
let closing = false;
let disposing = false;

function isBackdropEvent(event: MouseEvent): boolean {
  const element = dialog.value;
  if (!element || event.target !== element) return false;
  const bounds = element.getBoundingClientRect();
  return (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  );
}

function handlePointerDown(event: PointerEvent): void {
  keyboardNavigation.value = false;
  pointerStartedOnBackdrop = event.button === 0 && isBackdropEvent(event);
}

function handleDialogClick(event: MouseEvent): void {
  const shouldClose = pointerStartedOnBackdrop && event.detail > 0 && isBackdropEvent(event);
  pointerStartedOnBackdrop = false;
  if (shouldClose) closeDialog();
}

function closeDialog(): void {
  if (closing || disposing) return;
  closing = true;
  emit('close');
}

function focusPanel(): void {
  dialog.value?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
}

onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value?.showModal();
  focusPanel();
});

onBeforeUnmount(() => {
  disposing = true;
  dialog.value?.close();
  if (opener?.isConnected) opener.focus({ preventScroll: true });
});

watch(
  () => props.panel,
  async () => {
    await nextTick();
    if (!disposing) focusPanel();
  },
);
watch(
  () => [props.snapshots, props.loading],
  () => {
    inspectedAt.value = Date.now();
  },
);

function validateDate(value: string): string {
  if (!value) return '请输入完整的公历日期。';
  return parseDateKey(value) ? '' : `请输入 ${supportedRange}内的有效日期。`;
}

function selectDate(value: string): void {
  const date = parseDateKey(value);
  if (!date) return;
  emit('select-date', date);
  closeDialog();
}

const jumpError = computed(() => validateDate(jumpDate.value));

function jumpToMonth(): void {
  const previous = parseDateKey(jumpDate.value) ?? props.selectedDate;
  const lastDay = new Date(jumpYear.value, jumpMonth.value, 0, 12).getDate();
  const date = new Date(
    jumpYear.value,
    jumpMonth.value - 1,
    Math.min(previous.getDate(), lastDay),
    12,
  );
  selectDate(formatDateKey(date));
}

function inclusiveEnd(endDate: DateKey): DateKey {
  const [year, month, day] = endDate.split('-').map(Number);
  return formatDateKey(new Date(year, month - 1, day - 1, 12));
}

function dateSpan(startDate: DateKey, endDate?: DateKey): string {
  const lastDate = endDate ? inclusiveEnd(endDate) : startDate;
  return lastDate > startDate ? `${startDate} 至 ${lastDate}` : startDate;
}

function intersectsYear(startDate: DateKey, endDate?: DateKey): boolean {
  const yearStart = `${queryYear.value}-01-01`;
  const yearEnd = `${queryYear.value}-12-31`;
  return startDate <= yearEnd && (endDate ? endDate > yearStart : startDate >= yearStart);
}

const holidayPeriods = computed(() => {
  if (props.panel !== 'holidays') return [];
  return getHolidayPeriods(
    props.events.filter((event) => event.period && intersectsYear(event.date, event.endDate)),
  ).sort((first, second) => first.startDate.localeCompare(second.startDate));
});
const standaloneEvents = computed(() => {
  if (props.panel !== 'holidays') return [];
  return props.events
    .filter((event) => !event.period && intersectsYear(event.date, event.endDate))
    .sort((first, second) => first.date.localeCompare(second.date));
});

function eventTypeLabel(event: HolidayEvent): string {
  if (event.type === 'workday') return '调休上班';
  if (event.type === 'dayoff') return '放假';
  if (event.type === 'holiday') return '节日';
  return '来源记录';
}

const holidayCountdown = computed(() =>
  props.panel === 'countdown' ? getHolidayCountdown(todayKey.value, props.events) : null,
);
const festivalCountdown = computed(() =>
  props.panel === 'countdown' ? getUpcomingFestival(todayKey.value) : null,
);
const rangeResult = computed(() => {
  if (props.panel !== 'range') return { value: null, error: '' };
  const error = validateDate(rangeStart.value) || validateDate(rangeEnd.value);
  if (error) return { value: null, error };
  if (rangeStart.value > rangeEnd.value) {
    return { value: null, error: '结束日期不能早于开始日期。' };
  }
  try {
    return {
      value: calculateDateRange(
        rangeStart.value,
        rangeEnd.value,
        { includeStart: includeStart.value, includeEnd: includeEnd.value },
        props.events,
        props.coverage,
      ),
      error: '',
    };
  } catch {
    return { value: null, error: '无法计算该日期区间，请检查日期和端点设置。' };
  }
});

const solarDateError = computed(() => validateDate(solarDate.value));
const lunarInfo = computed(() => {
  if (props.panel !== 'lunar') return null;
  const date = parseDateKey(solarDate.value);
  if (!date) return null;
  return getLunarDateInfo(date.getFullYear(), date.getMonth() + 1, date.getDate());
});
const lunarMonths = computed(() =>
  props.panel === 'lunar' ? getLunarMonths(lunarYear.value) : [],
);
const lunarMonthDays = computed(
  () => lunarMonths.value.find((month) => month.month === lunarMonth.value)?.days ?? 0,
);
watch(lunarMonths, (months) => {
  if (!months.length) return;
  if (!months.some((month) => month.month === lunarMonth.value)) {
    lunarMonth.value = months[0].month;
  }
});
watch(lunarMonthDays, (days) => {
  if (days > 0) lunarDay.value = Math.min(Math.max(1, lunarDay.value), days);
});
const convertedSolarDate = computed(() => {
  if (props.panel !== 'lunar' || !lunarMonthDays.value) return null;
  const date = convertLunarToSolar(lunarYear.value, lunarMonth.value, lunarDay.value);
  return date && parseDateKey(date) ? date : null;
});
const solarTerms = computed(() =>
  props.panel === 'solar' ? getYearSolarTerms(queryYear.value) : [],
);
const seasonalTerms = computed(() =>
  seasons.map((season) => ({
    season,
    terms: solarTerms.value.filter((term) => term.season === season),
  })),
);

function setWeekStart(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:preferences', { weekStartsOn: value === '0' ? 0 : 1 });
}

function setDensity(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (value === 'auto' || value === 'compact' || value === 'detailed') {
    emit('update:preferences', { monthDensity: value });
  }
}

function setToggle(key: 'showLunar' | 'showSolarTerms' | 'showWeekNumbers', event: Event): void {
  emit('update:preferences', { [key]: (event.target as HTMLInputElement).checked });
}

function formatTimestamp(value: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '未记录';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function cacheAge(snapshot: HolidaySnapshot): string {
  const minutes = Math.floor(Math.max(0, inspectedAt.value - snapshot.fetchedAt) / 60_000);
  if (minutes < 1) return '不足 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时`;
  return `${Math.floor(minutes / 1440)} 天 ${Math.floor((minutes % 1440) / 60)} 小时`;
}

function isStale(snapshot: HolidaySnapshot): boolean {
  return inspectedAt.value - snapshot.fetchedAt >= 24 * 60 * 60 * 1000;
}

function formatYears(values: number[]): string {
  const sorted = [...new Set(values)].sort((first, second) => first - second);
  const groups: string[] = [];
  let start = sorted[0];
  let previous = start;
  for (const year of sorted.slice(1)) {
    if (year !== previous + 1) {
      groups.push(start === previous ? String(start) : `${start}—${previous}`);
      start = year;
    }
    previous = year;
  }
  if (start !== undefined) {
    groups.push(start === previous ? String(start) : `${start}—${previous}`);
  }
  return groups.join('、') || '无';
}

function coverageYears(snapshot: HolidaySnapshot, status: CalendarCoverage): string {
  return formatYears(
    Object.entries(snapshot.coverage)
      .filter(([, coverage]) => coverage === status)
      .map(([year]) => Number(year)),
  );
}

const sourceCards = computed(() =>
  sourceIds.map((source) => ({
    source,
    snapshot: props.snapshots.find((snapshot) => snapshot.source === source),
    error: props.errors[source],
  })),
);
</script>

<template>
  <dialog
    ref="dialog"
    class="calendar-dialog"
    :class="{ 'is-keyboard-navigation': keyboardNavigation }"
    :aria-labelledby="`${inputId}-title`"
    @cancel.prevent="closeDialog"
    @close="closeDialog"
    @pointerdown="handlePointerDown"
    @pointercancel="pointerStartedOnBackdrop = false"
    @click="handleDialogClick"
    @keydown="keyboardNavigation = true"
  >
    <header class="dialog-header">
      <div>
        <h2 :id="`${inputId}-title`">{{ label.title }}</h2>
      </div>
      <button type="button" class="close-button" aria-label="关闭日历查询" @click="closeDialog">
        <span aria-hidden="true">×</span>
      </button>
    </header>

    <div class="dialog-content">
      <label v-if="showYearPicker" class="field year-picker">
        <span>查询年份</span>
        <span class="calendar-select">
          <select v-model.number="queryYear" data-initial-focus>
            <option v-for="year in years" :key="year" :value="year">{{ year }} 年</option>
          </select>
          <IconChevronDown aria-hidden="true" />
        </span>
      </label>

      <template v-if="panel === 'jump'">
        <form class="section" @submit.prevent="jumpToMonth">
          <h3>按年月定位</h3>
          <div class="field-grid">
            <label class="field year-picker">
              <span>公历年份</span>
              <span class="calendar-select">
                <select v-model.number="jumpYear" data-initial-focus>
                  <option v-for="year in years" :key="year" :value="year">{{ year }} 年</option>
                </select>
                <IconChevronDown aria-hidden="true" />
              </span>
            </label>
            <label class="field">
              <span>公历月份</span>
              <span class="calendar-select">
                <select v-model.number="jumpMonth">
                  <option v-for="month in 12" :key="month" :value="month">{{ month }} 月</option>
                </select>
                <IconChevronDown aria-hidden="true" />
              </span>
            </label>
          </div>
          <p class="muted">保留当前日号；目标月份没有该日期时，定位到该月最后一天。</p>
          <button type="submit" class="action-button">定位到该月</button>
        </form>
        <form class="section" novalidate @submit.prevent="selectDate(jumpDate)">
          <label class="field">
            <span>公历日期</span>
            <input
              v-model="jumpDate"
              type="date"
              :min="minDate"
              :max="maxDate"
              :aria-invalid="Boolean(jumpError)"
              :aria-describedby="`${inputId}-jump-help`"
            />
          </label>
          <p :id="`${inputId}-jump-help`" :class="jumpError ? 'error' : 'muted'" aria-live="polite">
            {{ jumpError || `支持 ${supportedRange}。` }}
          </p>
          <button type="submit" class="action-button primary" :disabled="Boolean(jumpError)">
            前往该日期
          </button>
        </form>
      </template>

      <template v-else-if="panel === 'holidays'">
        <p v-if="yearCoverage !== 'complete'" class="notice" role="status">
          {{
            yearCoverage === 'partial'
              ? `${queryYear} 年仅收录部分休班记录，以下不是完整全年安排。`
              : `${queryYear} 年休班安排未收录，不代表该年没有假期。`
          }}
        </p>
        <p v-else class="muted">
          {{ queryYear }} 年休班安排完整收录；假期与节日本身的日期分别计算。
        </p>
        <ul v-if="holidayPeriods.length" class="card-list">
          <li v-for="period in holidayPeriods" :key="period.id" class="card">
            <button
              type="button"
              class="record-button"
              :aria-label="`查看${period.title}，${dateSpan(period.startDate, period.endDate)}`"
              @click="selectDate(period.startDate)"
            >
              <span class="record-heading">
                <strong>{{ period.title }}</strong>
                <span class="badge">{{ dateDistance(period.startDate, period.endDate) }} 天</span>
              </span>
              <span class="muted">{{ dateSpan(period.startDate, period.endDate) }}</span>
            </button>
            <div v-if="period.compDays.length" class="comp-days">
              <span class="muted">调休上班</span>
              <button
                v-for="date in period.compDays"
                :key="date"
                type="button"
                class="date-chip"
                :aria-label="`查看调休上班日期 ${date}`"
                @click="selectDate(date)"
              >
                {{ date }}
              </button>
            </div>
            <p v-else class="muted">来源未列出关联补班日期。</p>
          </li>
        </ul>
        <section v-if="standaloneEvents.length" class="section">
          <h3>独立来源记录</h3>
          <p class="muted">按来源实际记录展示，不推断假期分组或补班关联。</p>
          <ul class="card-list">
            <li v-for="event in standaloneEvents" :key="event.id" class="card">
              <button type="button" class="record-button" @click="selectDate(event.date)">
                <span class="record-heading">
                  <strong>{{ event.title }}</strong>
                  <span class="badge">{{ eventTypeLabel(event) }}</span>
                </span>
                <span class="muted">{{ dateSpan(event.date, event.endDate) }}</span>
              </button>
            </li>
          </ul>
        </section>
        <p v-if="!holidayPeriods.length && !standaloneEvents.length" class="empty-state">
          {{ loading ? '正在获取休班安排…' : '暂无可展示的假期记录。农历与节气查询仍可使用。' }}
        </p>
      </template>

      <template v-else-if="panel === 'countdown'">
        <p class="muted">今天是 {{ todayKey }}。以下倒计时不使用当前选中日期。</p>
        <section class="card section">
          <h3>实际假期</h3>
          <template v-if="holidayCountdown">
            <p class="countdown-title">{{ holidayCountdown.title }}</p>
            <p class="countdown-number">
              {{ holidayCountdown.ongoing ? '还剩' : '还有' }}
              <strong>{{
                holidayCountdown.ongoing
                  ? holidayCountdown.remainingDays
                  : holidayCountdown.daysUntil
              }}</strong>
              天
            </p>
            <p class="muted">
              {{ holidayCountdown.ongoing ? '假期进行中' : '假期开始日期' }} ·
              {{ holidayCountdown.date }}
            </p>
            <button
              type="button"
              class="action-button"
              data-initial-focus
              @click="selectDate(holidayCountdown.ongoing ? todayKey : holidayCountdown.date)"
            >
              查看假期
            </button>
          </template>
          <p v-else class="muted">没有收录后续假期安排，不预测下一年度放假日期。</p>
        </section>
        <section class="card section">
          <h3>最近节日</h3>
          <template v-if="festivalCountdown">
            <p class="countdown-title">{{ festivalCountdown.title }}</p>
            <p class="countdown-number">
              <template v-if="festivalCountdown.distance === 0">就是今天</template>
              <template v-else
                >还有 <strong>{{ festivalCountdown.distance }}</strong> 天</template
              >
            </p>
            <p class="muted">{{ festivalCountdown.date }} · 本地历法计算，节日不等于放假。</p>
            <button type="button" class="action-button" @click="selectDate(festivalCountdown.date)">
              查看节日
            </button>
          </template>
          <p v-else class="muted">支持范围内暂无可展示的后续节日。</p>
        </section>
      </template>

      <template v-else-if="panel === 'range'">
        <div class="field-grid">
          <label class="field">
            <span>开始日期</span>
            <input
              v-model="rangeStart"
              type="date"
              :min="minDate"
              :max="maxDate"
              :aria-invalid="Boolean(validateDate(rangeStart))"
              :aria-describedby="`${inputId}-range-error`"
              data-initial-focus
            />
          </label>
          <label class="field">
            <span>结束日期</span>
            <input
              v-model="rangeEnd"
              type="date"
              :min="minDate"
              :max="maxDate"
              :aria-invalid="Boolean(validateDate(rangeEnd)) || rangeStart > rangeEnd"
              :aria-describedby="`${inputId}-range-error`"
            />
          </label>
        </div>
        <div class="checkbox-row">
          <label class="check-label"
            ><input v-model="includeStart" type="checkbox" />包含开始日期</label
          >
          <label class="check-label"
            ><input v-model="includeEnd" type="checkbox" />包含结束日期</label
          >
        </div>
        <p :id="`${inputId}-range-error`" class="error" aria-live="polite">
          {{ rangeResult.error }}
        </p>
        <section v-if="rangeResult.value" class="section" aria-live="polite" aria-atomic="true">
          <h3>{{ rangeResult.value.estimated ? '仅按周末估算' : '按已收录完整休班安排计算' }}</h3>
          <dl class="stats-grid">
            <div>
              <dt>自然日</dt>
              <dd>{{ rangeResult.value.naturalDays }} <small>天</small></dd>
            </div>
            <div>
              <dt>周末日</dt>
              <dd>{{ rangeResult.value.weekendDays }} <small>天</small></dd>
            </div>
            <div>
              <dt>{{ rangeResult.value.estimated ? '估算工作日' : '工作日' }}</dt>
              <dd>{{ rangeResult.value.workDays }} <small>天</small></dd>
            </div>
            <div>
              <dt>{{ rangeResult.value.estimated ? '估算休息日' : '休息日' }}</dt>
              <dd>{{ rangeResult.value.restDays }} <small>天</small></dd>
            </div>
          </dl>
          <p v-if="rangeResult.value.estimated" class="notice">
            {{ formatYears(rangeResult.value.missingYears) }} 年缺少完整休班安排。
            整个区间仅按周一至周五工作、周六日休息估算，不混用部分节假日数据。
          </p>
          <p class="muted">
            周末日仅统计周六、周日；完整安排中的周末补班计入工作日，不计入休息日。
          </p>
        </section>
      </template>

      <template v-else-if="panel === 'lunar'">
        <section class="section">
          <h3>公历 → 农历</h3>
          <label class="field">
            <span>公历日期</span>
            <input
              v-model="solarDate"
              type="date"
              :min="minDate"
              :max="maxDate"
              :aria-invalid="Boolean(solarDateError)"
              :aria-describedby="`${inputId}-solar-error`"
              data-initial-focus
            />
          </label>
          <p :id="`${inputId}-solar-error`" class="error" aria-live="polite">
            {{ solarDateError }}
          </p>
          <div v-if="lunarInfo" class="card section" aria-live="polite">
            <strong>{{ lunarInfo.fullText }}</strong>
            <p v-if="lunarInfo.festivals.length" class="muted">
              {{ lunarInfo.festivals.join(' · ') }}
            </p>
            <p v-if="lunarInfo.solarTerm" class="muted">节气：{{ lunarInfo.solarTerm }}</p>
            <button type="button" class="action-button" @click="selectDate(solarDate)">
              前往该日期
            </button>
          </div>
        </section>
        <section class="section">
          <h3>农历 → 公历</h3>
          <div class="field-grid lunar-fields">
            <label class="field year-picker">
              <span>农历年份</span>
              <span class="calendar-select">
                <select v-model.number="lunarYear">
                  <option v-for="year in lunarYears" :key="year" :value="year">
                    {{ year }} 年
                  </option>
                </select>
                <IconChevronDown aria-hidden="true" />
              </span>
            </label>
            <label class="field">
              <span>农历月份</span>
              <span class="calendar-select">
                <select v-model.number="lunarMonth">
                  <option v-for="month in lunarMonths" :key="month.month" :value="month.month">
                    {{ month.name }}
                  </option>
                </select>
                <IconChevronDown aria-hidden="true" />
              </span>
            </label>
            <label class="field">
              <span>农历日期</span>
              <span class="calendar-select">
                <select v-model.number="lunarDay">
                  <option v-for="day in lunarMonthDays" :key="day" :value="day">
                    {{ day }} 日
                  </option>
                </select>
                <IconChevronDown aria-hidden="true" />
              </span>
            </label>
          </div>
          <p class="muted">月份列表包含该年的真实闰月，日期按实际月份天数调整。</p>
          <p aria-live="polite" :class="convertedSolarDate ? 'conversion-result' : 'error'">
            {{
              convertedSolarDate
                ? `公历 ${convertedSolarDate}`
                : `该农历日期无效或超出公历支持范围（${supportedRange}）。`
            }}
          </p>
          <button
            type="button"
            class="action-button primary"
            :disabled="!convertedSolarDate"
            @click="convertedSolarDate && selectDate(convertedSolarDate)"
          >
            前往转换后的日期
          </button>
        </section>
      </template>

      <template v-else-if="panel === 'solar'">
        <p v-if="solarTerms.length !== 24" class="notice" role="status">
          该年份未取得完整的二十四节气数据。
        </p>
        <section v-for="group in seasonalTerms" :key="group.season" class="section">
          <h3>{{ group.season }}季</h3>
          <ul class="terms-grid">
            <li v-for="term in group.terms" :key="`${term.name}-${term.date}`">
              <button
                type="button"
                class="term-button"
                :aria-label="`${term.name}，${term.date}，前往日期`"
                @click="selectDate(term.date)"
              >
                <strong>{{ term.name }}</strong>
                <span>{{ term.date }}</span>
              </button>
            </li>
          </ul>
        </section>
      </template>

      <template v-else-if="panel === 'preferences'">
        <label class="field">
          <span>每周起始日</span>
          <span class="calendar-select">
            <select :value="preferences.weekStartsOn" data-initial-focus @change="setWeekStart">
              <option :value="1">周一</option>
              <option :value="0">周日</option>
            </select>
            <IconChevronDown aria-hidden="true" />
          </span>
        </label>
        <label class="preference-row">
          <span><strong>显示农历</strong><small>在日历中显示农历日期。</small></span>
          <input
            type="checkbox"
            :checked="preferences.showLunar"
            @change="setToggle('showLunar', $event)"
          />
        </label>
        <label class="preference-row">
          <span><strong>显示节气</strong><small>在日历中显示当天的节气。</small></span>
          <input
            type="checkbox"
            :checked="preferences.showSolarTerms"
            @change="setToggle('showSolarTerms', $event)"
          />
        </label>
        <label class="preference-row" :class="{ 'is-disabled': preferences.weekStartsOn === 0 }">
          <span
            ><strong>显示 ISO 周数</strong
            ><small>仅周一起始时显示，跨年周包含其所属年份。</small></span
          >
          <input
            type="checkbox"
            :checked="preferences.weekStartsOn === 1 && preferences.showWeekNumbers"
            :disabled="preferences.weekStartsOn === 0"
            @change="setToggle('showWeekNumbers', $event)"
          />
        </label>
        <label class="field">
          <span>月历布局</span>
          <span class="calendar-select">
            <select :value="preferences.monthDensity" @change="setDensity">
              <option value="auto">自动（手机紧凑，桌面详细）</option>
              <option value="compact">紧凑</option>
              <option value="detailed">详细</option>
            </select>
            <IconChevronDown aria-hidden="true" />
          </span>
        </label>
      </template>

      <template v-else-if="panel === 'sources'">
        <section class="card section">
          <h3>{{ queryYear }} 年实际使用的数据</h3>
          <p>{{ selectedSource ? sourceNames[selectedSource] : '暂无可用休班来源' }}</p>
          <p class="muted">年度覆盖：{{ coverageLabels[yearCoverage] }}</p>
          <p class="muted">主源优先，同一年度不混用两个来源。农历、节日与节气由本地历法计算。</p>
        </section>
        <div class="refresh-row">
          <p class="muted" role="status">
            {{
              loading
                ? '正在刷新；已有成功数据仍可使用。'
                : '缓存超过 24 小时后，在打开或返回页面时检查更新。'
            }}
          </p>
          <button
            type="button"
            class="action-button primary"
            :disabled="loading"
            :aria-busy="loading"
            @click="emit('refresh')"
          >
            {{ loading ? '刷新中…' : '刷新数据' }}
          </button>
        </div>
        <section v-for="card in sourceCards" :key="card.source" class="card section">
          <div class="record-heading">
            <h3>{{ sourceNames[card.source] }}</h3>
            <span class="badge">{{ card.source === 'lanceliao' ? '主源 JSON' : '备用 ICS' }}</span>
          </div>
          <dl v-if="card.snapshot" class="source-details">
            <div>
              <dt>最近成功获取</dt>
              <dd>{{ formatTimestamp(card.snapshot.fetchedAt) }}</dd>
            </div>
            <div>
              <dt>上游声明更新时间</dt>
              <dd>{{ card.snapshot.updatedAt || '来源未提供' }}</dd>
            </div>
            <div>
              <dt>缓存时长</dt>
              <dd>
                {{ cacheAge(card.snapshot) }} ·
                {{ isStale(card.snapshot) ? '已超过 24 小时' : '24 小时内' }}
              </dd>
            </div>
            <div>
              <dt>完整覆盖年份</dt>
              <dd>{{ coverageYears(card.snapshot, 'complete') }}</dd>
            </div>
            <div>
              <dt>部分记录年份</dt>
              <dd>{{ coverageYears(card.snapshot, 'partial') }}</dd>
            </div>
            <div v-if="coverageYears(card.snapshot, 'unavailable') !== '无'">
              <dt>已标记未收录</dt>
              <dd>{{ coverageYears(card.snapshot, 'unavailable') }}</dd>
            </div>
          </dl>
          <p v-else class="muted">尚无最近成功数据。</p>
          <p v-if="card.error" class="error" role="status">
            刷新失败：{{ card.error }}{{ card.snapshot ? ' 已保留最近成功数据。' : '' }}
          </p>
        </section>
      </template>
    </div>
  </dialog>
</template>

<style scoped>
.calendar-dialog {
  --color-surface-solid: #ffffff;
  box-sizing: border-box;
  width: min(720px, calc(100vw - 32px));
  max-width: none;
  max-height: min(880px, 88dvh);
  margin: auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  color: var(--color-text);
  background: var(--color-surface-solid);
  box-shadow: 0 20px 80px rgb(0 0 0 / 20%);
  overflow-wrap: anywhere;
}

:global(html[data-theme='dark'] .calendar-dialog) {
  --color-surface-solid: #171b22;
}

.calendar-dialog[open] {
  display: flex;
  flex-direction: column;
}
.calendar-dialog::backdrop {
  background: rgb(0 0 0 / 48%);
}
.calendar-dialog *,
.calendar-dialog *::before,
.calendar-dialog *::after {
  box-sizing: border-box;
}
.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  padding: 22px 24px 18px;
  border-bottom: 1px solid var(--color-border);
}
.dialog-header > div {
  min-width: 0;
}
.dialog-header h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.4;
}
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  padding: 24px;
  overflow: auto;
  overscroll-behavior: contain;
}
.dialog-content h3,
.dialog-content p,
.dialog-content dl {
  margin: 0;
}
.dialog-content h3 {
  font-size: 15px;
  line-height: 1.5;
}
.dialog-content p {
  font-size: 14px;
  line-height: 1.7;
}
.dialog-content .muted,
.dialog-content .error {
  font-size: 13px;
}
.muted {
  color: var(--color-text-muted);
}
.error {
  color: var(--color-text);
}
.error:not(:empty) {
  padding-left: 10px;
  border-left: 3px solid var(--tools-accent);
}
.error:empty {
  display: none;
}
.section {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}
.section + .section {
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
}
.field > span:not(.calendar-select) {
  font-weight: 600;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.lunar-fields {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.year-picker {
  width: min(100%, 140px);
}
.calendar-dialog input:not([type='checkbox']),
.calendar-dialog select {
  appearance: none;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  padding: 9px 10px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  color: var(--color-text);
  background: var(--color-surface-solid);
  font: inherit;
  line-height: 1.5;
}
.calendar-dialog select {
  padding-right: 36px;
  cursor: pointer;
}
.calendar-select {
  display: grid;
  align-items: center;
  min-width: 0;
}
.calendar-select > select,
.calendar-select > svg {
  grid-area: 1 / 1;
}
.calendar-select > svg {
  z-index: 1;
  justify-self: end;
  width: 16px;
  height: 16px;
  margin-right: 12px;
  color: var(--color-text-muted);
  pointer-events: none;
}
.calendar-dialog .year-picker select {
  height: 36px;
  min-height: 36px;
  padding-block: 5px;
}
.calendar-dialog select option,
.calendar-dialog select optgroup {
  color: var(--color-text);
  background: var(--color-surface-solid);
}
.calendar-dialog input[type='date'] {
  min-inline-size: 0;
}
.calendar-dialog input[type='date']::-webkit-date-and-time-value {
  min-height: 1.5em;
  text-align: left;
}
.calendar-dialog input[type='date']::-webkit-calendar-picker-indicator {
  flex-shrink: 0;
  margin-left: 8px;
  cursor: pointer;
}
.calendar-dialog input[type='checkbox'] {
  appearance: auto;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin: 0;
  accent-color: var(--tools-accent);
}
.calendar-dialog button {
  appearance: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.calendar-dialog button:disabled,
.calendar-dialog input:disabled,
.calendar-dialog select:disabled {
  cursor: not-allowed;
  color: var(--color-text-muted);
  opacity: 1;
}
.calendar-dialog select:focus {
  outline: none;
}
.calendar-dialog :is(button, input):focus-visible,
.calendar-dialog.is-keyboard-navigation select:focus-visible {
  outline: 2px solid var(--tools-accent);
  outline-offset: 3px;
}
.close-button {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-soft);
}
.close-button span {
  font-size: 26px;
  line-height: 1;
}
.action-button {
  align-self: flex-start;
  min-height: 40px;
  padding: 9px 16px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: var(--color-surface-soft);
  font-size: 14px !important;
  line-height: 1.5;
}
.calendar-dialog .primary {
  border-color: var(--tools-accent);
  color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 10%, var(--color-surface-solid));
}
.calendar-dialog button:hover:not(:disabled) {
  border-color: var(--tools-accent);
}
.notice,
.empty-state {
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text-muted);
  background: var(--color-surface-soft);
}
.notice {
  border-left: 3px solid var(--tools-accent);
}
.card-list,
.terms-grid {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.card {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-soft);
}
.card.section + .card.section {
  padding-top: 16px;
}
.record-button {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: 0;
  text-align: left;
  background: transparent;
}
.record-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.record-heading strong {
  font-size: 15px;
}
.badge {
  display: inline-flex;
  padding: 3px 8px;
  border-radius: 6px;
  color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 10%, var(--color-surface-solid));
  font-size: 12px;
  line-height: 1.5;
}
.comp-days {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.date-chip {
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-solid);
  font-size: 12px !important;
}
.card > .record-button + .muted {
  margin-top: 12px;
}
.countdown-title {
  font-size: 18px !important;
  font-weight: 600;
}
.countdown-number strong {
  margin: 0 4px;
  color: var(--tools-accent);
  font-size: 32px;
  font-variant-numeric: tabular-nums;
}
.checkbox-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
}
.check-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.stats-grid > div {
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-soft);
}
.stats-grid dt {
  color: var(--color-text-muted);
  font-size: 13px;
}
.stats-grid dd {
  margin: 8px 0 0;
  font-size: 25px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stats-grid small {
  font-size: 13px;
  font-weight: 400;
}
.conversion-result {
  color: var(--tools-accent);
  font-weight: 600;
}
.terms-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.term-button {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  text-align: left;
  background: var(--color-surface-soft);
}
.term-button span {
  color: var(--color-text-muted);
  font-size: 12px;
}
.preference-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 0 18px;
  border-bottom: 1px solid var(--color-border);
}
.preference-row strong {
  display: block;
  font-size: 14px;
}
.preference-row small {
  display: block;
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.6;
}
.is-disabled {
  color: var(--color-text-muted);
}
.refresh-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.refresh-row p {
  flex: 1 1 220px;
}
.source-details {
  display: grid;
  gap: 10px;
}
.source-details > div {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 12px;
  font-size: 13px;
  line-height: 1.6;
}
.source-details dt {
  color: var(--color-text-muted);
}
.source-details dd {
  margin: 0;
  white-space: pre-wrap;
}

@media (max-width: 560px) {
  .calendar-dialog {
    width: 100%;
    height: 100dvh;
    max-height: none;
    margin: 0;
    border: 0;
    border-radius: 0;
  }
  .dialog-header {
    padding: calc(18px + env(safe-area-inset-top)) 16px 16px;
  }
  .dialog-header h2 {
    font-size: 18px;
  }
  .dialog-content {
    flex: 1;
    padding: 20px 16px calc(24px + env(safe-area-inset-bottom));
  }
  .calendar-dialog input:not([type='checkbox']),
  .calendar-dialog select {
    font-size: 16px;
  }
  .terms-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .lunar-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .lunar-fields .field:first-child {
    grid-column: 1 / -1;
  }
  .source-details > div {
    grid-template-columns: 1fr;
    gap: 3px;
  }
}

@media (max-width: 360px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
  .card {
    padding: 12px;
  }
  .stats-grid > div {
    padding: 12px;
  }
}
</style>
