import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

interface CanvasSurface {
  readonly width: number;
  readonly height: number;
}

interface SurfaceEntry {
  readonly source: CanvasSurface;
  readonly texture: CanvasTexture;
  readonly byteSize: number;
  references: number;
  lastUsed: number;
}

export class PageSurfaceCache {
  readonly maxBytes: number;
  readonly #maxAnisotropy: number;
  readonly #bySource = new Map<CanvasSurface, SurfaceEntry>();
  readonly #byTexture = new Map<CanvasTexture, SurfaceEntry>();
  #byteSize = 0;
  #clock = 0;

  constructor(maxBytes: number, maxAnisotropy: number) {
    this.maxBytes = Math.max(0, Math.floor(maxBytes));
    this.#maxAnisotropy = Math.max(1, Math.floor(maxAnisotropy));
  }

  get size(): number {
    return this.#byTexture.size;
  }

  get byteSize(): number {
    return this.#byteSize;
  }

  acquire(source: CanvasSurface): CanvasTexture {
    const entry = this.#getOrCreate(source);
    entry.references += 1;
    entry.lastUsed = ++this.#clock;
    return entry.texture;
  }

  warm(source: CanvasSurface): CanvasTexture {
    const entry = this.#getOrCreate(source);
    entry.lastUsed = ++this.#clock;
    return entry.texture;
  }

  release(texture: CanvasTexture | null | undefined): void {
    if (!texture) return;
    const entry = this.#byTexture.get(texture);
    if (!entry) return;
    entry.references = Math.max(0, entry.references - 1);
    entry.lastUsed = ++this.#clock;
  }

  refCount(texture: CanvasTexture): number {
    return this.#byTexture.get(texture)?.references ?? 0;
  }

  prune(): void {
    while (this.#byteSize > this.maxBytes) {
      const candidate = [...this.#byTexture.values()]
        .filter((entry) => entry.references === 0)
        .sort((left, right) => left.lastUsed - right.lastUsed)[0];
      if (!candidate) return;
      this.#delete(candidate);
    }
  }

  clear(): void {
    for (const entry of this.#byTexture.values()) entry.texture.dispose();
    this.#bySource.clear();
    this.#byTexture.clear();
    this.#byteSize = 0;
  }

  #getOrCreate(source: CanvasSurface): SurfaceEntry {
    const cached = this.#bySource.get(source);
    if (cached) return cached;

    const texture = new CanvasTexture(source as HTMLCanvasElement);
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = this.#maxAnisotropy;
    texture.needsUpdate = true;
    const entry: SurfaceEntry = {
      source,
      texture,
      byteSize: Math.max(1, source.width) * Math.max(1, source.height) * 4,
      references: 0,
      lastUsed: ++this.#clock,
    };
    this.#bySource.set(source, entry);
    this.#byTexture.set(texture, entry);
    this.#byteSize += entry.byteSize;
    return entry;
  }

  #delete(entry: SurfaceEntry): void {
    this.#bySource.delete(entry.source);
    this.#byTexture.delete(entry.texture);
    this.#byteSize = Math.max(0, this.#byteSize - entry.byteSize);
    entry.texture.dispose();
  }
}
