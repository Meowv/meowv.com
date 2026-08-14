import type { ReaderLayoutProfile } from '../types/reader';

export const DEFAULT_READER_LAYOUT: Readonly<ReaderLayoutProfile> = Object.freeze({
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.75,
  pageMargin: 10,
  theme: 'warm',
});

export function normalizeReaderLayout(
  profile: Partial<ReaderLayoutProfile> = {},
): ReaderLayoutProfile {
  const resolved = { ...DEFAULT_READER_LAYOUT, ...profile };
  return {
    fontFamily:
      resolved.fontFamily === 'publisher' ||
      resolved.fontFamily === 'serif' ||
      resolved.fontFamily === 'sans'
        ? resolved.fontFamily
        : DEFAULT_READER_LAYOUT.fontFamily,
    fontSize: Math.min(28, Math.max(14, Math.round(resolved.fontSize))),
    lineHeight: Math.min(2.2, Math.max(1.3, Number(resolved.lineHeight.toFixed(2)))),
    pageMargin: Math.min(18, Math.max(5, Math.round(resolved.pageMargin))),
    theme:
      resolved.theme === 'paper' || resolved.theme === 'warm' || resolved.theme === 'night'
        ? resolved.theme
        : DEFAULT_READER_LAYOUT.theme,
  };
}

export function readerLayoutKey(profile: ReaderLayoutProfile): string {
  return [
    profile.fontFamily,
    profile.fontSize,
    profile.lineHeight.toFixed(2),
    profile.pageMargin,
    profile.theme,
  ].join(':');
}
