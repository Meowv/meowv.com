import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for public/onlyoffice-v7-iframe-patch.js.
 *
 * The patch is a static asset injected into each editor iframe before the SDK
 * scripts. It is not part of the app bundle, so we load the source directly and
 * eval it inside the jsdom window to exercise its two behaviours:
 *   1. requestIdleCallback / cancelIdleCallback polyfill (#84, Safari)
 *   2. font XHR request rewriting (#62, #64 — CJK + Windows absolute paths)
 */

const PATCH_SRC = readFileSync(resolve(process.cwd(), 'public/onlyoffice-v7-iframe-patch.js'), 'utf-8');

// A font-map fixture: 'arial.ttf' is mapped, everything else falls back.
const FONT_MAP = { 'arial.ttf': 'LiberationSans-Regular.ttf', _comment: 'fixture' };
const FALLBACK = 'NotoSansSC-VF.ttf';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Eval the patch IIFE in the current jsdom window context. */
const runPatch = () => {
  // eslint-disable-next-line no-eval
  (0, eval)(PATCH_SRC);
};

describe('onlyoffice-v7-iframe-patch', () => {
  beforeEach(() => {
    // Patch fetches font-map.json on load; resolve it with our fixture.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ ...FONT_MAP }) })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('requestIdleCallback polyfill (#84)', () => {
    it('installs requestIdleCallback when missing', async () => {
      // @ts-expect-error force the missing-global case Safari hits
      delete window.requestIdleCallback;
      // @ts-expect-error
      delete window.cancelIdleCallback;

      runPatch();
      await flush();

      expect(typeof window.requestIdleCallback).toBe('function');
      expect(typeof window.cancelIdleCallback).toBe('function');
    });

    it('invokes the callback with a deadline object', async () => {
      // @ts-expect-error
      delete window.requestIdleCallback;
      runPatch();
      await flush();

      const cb = vi.fn();
      window.requestIdleCallback(cb);
      await flush();

      expect(cb).toHaveBeenCalledTimes(1);
      const deadline = cb.mock.calls[0][0];
      expect(deadline.didTimeout).toBe(false);
      expect(typeof deadline.timeRemaining()).toBe('number');
      expect(deadline.timeRemaining()).toBeGreaterThanOrEqual(0);
    });

    it('does not override an existing requestIdleCallback', async () => {
      const existing = vi.fn();
      window.requestIdleCallback = existing as unknown as typeof window.requestIdleCallback;

      runPatch();
      await flush();

      expect(window.requestIdleCallback).toBe(existing);
    });
  });

  describe('font XHR rewriting (#62, #64)', () => {
    let openSpy: ReturnType<typeof vi.fn>;
    let originalHref: string;

    beforeEach(() => {
      // Font remap is spreadsheet-editor-only (924ffb8): Word/PPT render by glyph-ID
      // and substituting fonts garbles them, so the patch only rewrites in the cell
      // editor. These #62/#64 cases ARE the cell editor, so run them under a
      // spreadsheet-editor path (otherwise DISABLE_FONT_REMAP is true and nothing is
      // rewritten). The "outside the spreadsheet editor" test below overrides this.
      originalHref = window.location.href;
      window.history.replaceState({}, '', '/web-apps/apps/spreadsheeteditor/main/index.html');
      // The patch captures the current prototype.open as origOpen, then wraps it.
      // Installing a fresh spy before each eval prevents wrappers from stacking.
      openSpy = vi.fn();
      window.XMLHttpRequest.prototype.open = openSpy as unknown as typeof window.XMLHttpRequest.prototype.open;
    });

    afterEach(() => {
      window.history.replaceState({}, '', originalHref);
    });

    const openUrl = (url: string): string | undefined => {
      const xhr = new window.XMLHttpRequest();
      xhr.open('GET', url);
      return openSpy.mock.calls[0]?.[1] as string | undefined;
    };

    it('rewrites Windows absolute font paths to a mapped /fonts/ file', async () => {
      runPatch();
      await flush();
      expect(openUrl('c:\\Windows\\Fonts\\arial.ttf')).toBe('/fonts/LiberationSans-Regular.ttf');
    });

    it('falls back for unmapped Windows font paths', async () => {
      runPatch();
      await flush();
      expect(openUrl('c:\\Windows\\Fonts\\unknown.ttf')).toBe(`/fonts/${FALLBACK}`);
    });

    it('rewrites ascdesktop://fonts/ scheme', async () => {
      runPatch();
      await flush();
      expect(openUrl('ascdesktop://fonts/arial.ttf')).toBe('/fonts/LiberationSans-Regular.ttf');
    });

    it('remaps relative /fonts/ requests that are in the font map', async () => {
      runPatch();
      await flush();
      expect(openUrl('https://example.com/fonts/arial.ttf')).toBe('/fonts/LiberationSans-Regular.ttf');
    });

    it('leaves unrelated URLs untouched', async () => {
      runPatch();
      await flush();
      expect(openUrl('https://example.com/api/data.json')).toBe('https://example.com/api/data.json');
    });

    it('does NOT rewrite fonts outside the spreadsheet editor (Word/PPT)', async () => {
      // Word/PPT render by glyph-ID; rewriting their font requests garbles them, so
      // remap is disabled there (924ffb8). The font URL must pass through unchanged.
      window.history.replaceState({}, '', '/web-apps/apps/documenteditor/main/index.html');
      runPatch();
      await flush();
      expect(openUrl('c:\\Windows\\Fonts\\arial.ttf')).toBe('c:\\Windows\\Fonts\\arial.ttf');
    });
  });
});
