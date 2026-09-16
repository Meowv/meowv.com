const TRANSFORM_SCALE_PATTERN = /scale\(\s*([^)]+)\s*\)/iu;

function readScale(container: HTMLElement): number | null {
  const svg = container.querySelector<SVGSVGElement>('.mw-svg-host svg');
  const transform = svg?.style.transform ?? '';
  const match = transform.match(TRANSFORM_SCALE_PATTERN);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function createViewportScaleSync(
  container: HTMLElement,
  onScale: (scale: number) => void,
): { sync(): void; dispose(): void } {
  let frame = 0;
  let disposed = false;

  const sync = () => {
    if (disposed) return;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      const scale = readScale(container);
      if (scale !== null) onScale(scale);
    });
  };

  const observer =
    typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => sync());
  observer?.observe(container, {
    attributes: true,
    attributeFilter: ['style', 'transform'],
    childList: true,
    subtree: true,
  });
  sync();

  return {
    sync,
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
    },
  };
}
