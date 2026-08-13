export interface BookConfig {
  pageHeight: number;
  coverOversize: number;
  coverThickness: number;
  paperThickness: number;
  minimumStackThickness: number;
  maximumStackThickness: number;
  widthSegments: number;
  heightSegments: number;
  gutterDepth: number;
  gutterFalloff: number;
  curlStrength: number;
  twistStrength: number;
  sagStrength: number;
  openDuration: number;
  closeDuration: number;
  clickTurnDuration: number;
  maxTextureEdge: number;
  textureBudgetBytes: number;
}

export const DEFAULT_BOOK_CONFIG: Readonly<BookConfig> = Object.freeze({
  pageHeight: 1.4,
  coverOversize: 1.018,
  coverThickness: 0.035,
  paperThickness: 0.00042,
  minimumStackThickness: 0.018,
  maximumStackThickness: 0.18,
  widthSegments: 32,
  heightSegments: 20,
  gutterDepth: 0.014,
  gutterFalloff: 0.12,
  curlStrength: 0.64,
  twistStrength: 0.08,
  sagStrength: 0.018,
  openDuration: 880,
  closeDuration: 820,
  clickTurnDuration: 720,
  maxTextureEdge: 2048,
  textureBudgetBytes: 96 * 1024 * 1024,
});

export function resolveBookConfig(overrides: Partial<BookConfig> = {}): Readonly<BookConfig> {
  return Object.freeze({ ...DEFAULT_BOOK_CONFIG, ...overrides });
}

export function getTotalPaperThickness(
  pageCount: number,
  config: Pick<
    BookConfig,
    'paperThickness' | 'minimumStackThickness' | 'maximumStackThickness'
  > = DEFAULT_BOOK_CONFIG,
): number {
  return Math.min(
    config.maximumStackThickness,
    Math.max(config.minimumStackThickness, pageCount * config.paperThickness),
  );
}

export function getStackThicknesses(
  progress: number,
  totalThickness: number,
  minimumEdge = DEFAULT_BOOK_CONFIG.minimumStackThickness,
): { left: number; right: number } {
  const safeProgress = Math.min(1, Math.max(0, progress));
  return {
    left: minimumEdge + totalThickness * safeProgress,
    right: minimumEdge + totalThickness * (1 - safeProgress),
  };
}
