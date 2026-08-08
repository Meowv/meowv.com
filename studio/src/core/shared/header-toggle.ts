import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';

const HEADER_TOGGLE_X_KEY = `${STORAGE_POLICY.preferences}:header-toggle-x:v1`;
const DEFAULT_HEADER_TOGGLE_X = 50;
const MIN_HEADER_TOGGLE_X = 3;
const MAX_HEADER_TOGGLE_X = 97;
const DRAG_TRIGGER_PX = 2;

function withClamp(value: number): number {
  return Math.min(MAX_HEADER_TOGGLE_X, Math.max(MIN_HEADER_TOGGLE_X, value));
}

export function clampHeaderToggleX(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HEADER_TOGGLE_X;
  return withClamp(value);
}

export function getHeaderToggleX(): number {
  if (!storageAvailable()) return DEFAULT_HEADER_TOGGLE_X;
  try {
    const raw = localStorage.getItem(HEADER_TOGGLE_X_KEY);
    if (raw === null) return DEFAULT_HEADER_TOGGLE_X;
    return clampHeaderToggleX(Number.parseFloat(raw));
  } catch {
    return DEFAULT_HEADER_TOGGLE_X;
  }
}

export function setHeaderToggleX(value: number): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(HEADER_TOGGLE_X_KEY, String(clampHeaderToggleX(value)));
  } catch {
    // 无法持久化时继续使用内存状态。
  }
}

export function calculateHeaderToggleX(
  startPercent: number,
  startClientX: number,
  clientX: number,
  viewportWidth: number,
): number {
  if (viewportWidth <= 0) return startPercent;
  return clampHeaderToggleX(startPercent + ((clientX - startClientX) * 100) / viewportWidth);
}

export function isHeaderToggleDragging(deltaX: number): boolean {
  return Math.abs(deltaX) >= DRAG_TRIGGER_PX;
}
