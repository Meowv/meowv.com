import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { formatDateKey } from '../calendar-date.util';
import { useCalendar, validatePreferences } from '../useCalendar';

const hooks = vi.hoisted(() => ({
  mounted: [] as (() => void)[],
  unmount: [] as (() => void)[],
  refresh: vi.fn(async () => {}),
  dispose: vi.fn(),
}));

vi.mock('vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue')>()),
  onMounted: (callback: () => void) => hooks.mounted.push(callback),
  onBeforeUnmount: (callback: () => void) => hooks.unmount.push(callback),
}));

vi.mock('../holiday.repository', () => ({
  createHolidayRepository: () => ({
    getState: () => ({ snapshots: [], errors: {}, loading: false }),
    refresh: hooks.refresh,
    dispose: hooks.dispose,
  }),
  resolveHolidayData: () => ({ events: [], coverage: {}, sourcesByYear: {} }),
}));

let scope: ReturnType<typeof effectScope>;
let storage: Map<string, string>;
let visibility: EventTarget & { visibilityState: string };

function setup() {
  scope = effectScope();
  const calendar = scope.run(useCalendar)!;
  hooks.mounted.forEach((callback) => callback());
  return calendar;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 7, 10));
  hooks.mounted.length = 0;
  hooks.unmount.length = 0;
  hooks.refresh.mockClear();
  hooks.dispose.mockClear();
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', visibility);
});

afterEach(() => {
  hooks.unmount.forEach((callback) => callback());
  scope?.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('日历会话', () => {
  it('兼容原有视图偏好，显示配置逐字段校验', () => {
    storage.set('meowv-studio:preferences:v1:calendar-view', 'week');
    storage.set(
      'meowv-studio:preferences:v1:calendar-display',
      '{"weekStartsOn":0,"showLunar":"no","monthDensity":"bad"}',
    );
    const calendar = setup();
    expect(calendar.currentView.value).toBe('week');
    expect(calendar.preferences.value).toMatchObject({
      weekStartsOn: 0,
      showLunar: true,
      monthDensity: 'auto',
    });
    expect(validatePreferences(null).showSolarTerms).toBe(true);
  });

  it('单击选中的日期跨视图保持一致，闰年导航截断到月底', () => {
    const calendar = setup();
    calendar.selectDate(new Date(2024, 1, 29));
    expect(calendar.currentView.value).toBe('month');
    calendar.setView('year');
    calendar.goNext();
    expect(calendar.selectedKey.value).toBe('2025-02-28');
    calendar.setView('day');
    expect(calendar.dayInfo.value.key).toBe('2025-02-28');
    calendar.goToday();
    expect(calendar.selectedKey.value).toBe('2026-09-07');
  });

  it('日期导航限制在支持范围，手动选择非法日期不改变当前状态', () => {
    const calendar = setup();
    calendar.selectDate(new Date(1900, 0, 1), 'day');
    expect(calendar.canGoPrevious.value).toBe(false);
    calendar.goPrevious();
    calendar.selectDate(new Date('invalid'));
    expect(calendar.selectedKey.value).toBe('1900-01-01');
    calendar.selectDate(new Date(2100, 11, 31), 'day');
    expect(calendar.canGoNext.value).toBe(false);
  });

  it('跨午夜更新今天标记但不擅自改变用户选中的日期', async () => {
    vi.setSystemTime(new Date(2026, 8, 7, 23, 59, 59));
    const calendar = setup();
    expect(calendar.dayInfo.value.isToday).toBe(true);
    await vi.advanceTimersByTimeAsync(1100);
    expect(formatDateKey(calendar.today.value)).toBe('2026-09-08');
    expect(calendar.selectedKey.value).toBe('2026-09-07');
    expect(calendar.dayInfo.value.isToday).toBe(false);
  });

  it('重新可见时校准日期并检查数据，销毁清理监听和定时器', () => {
    const calendar = setup();
    expect(hooks.refresh).toHaveBeenCalledTimes(1);
    visibility.visibilityState = 'hidden';
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(hooks.refresh).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(2026, 8, 9, 9));
    visibility.visibilityState = 'visible';
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(hooks.refresh).toHaveBeenCalledTimes(2);
    expect(formatDateKey(calendar.today.value)).toBe('2026-09-09');
    hooks.unmount.splice(0).forEach((callback) => callback());
    expect(hooks.dispose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(hooks.refresh).toHaveBeenCalledTimes(2);
  });

  it('偏好保存失败不影响本次使用', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const calendar = setup();
    calendar.updatePreferences({ showLunar: false, monthDensity: 'compact' });
    calendar.setView('week');
    await nextTick();
    expect(calendar.preferences.value.showLunar).toBe(false);
    expect(calendar.currentView.value).toBe('week');
  });
});
