import {
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';

export function createPageTexture(canvas: HTMLCanvasElement, anisotropy = 2): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = Math.min(4, Math.max(1, anisotropy));
  texture.needsUpdate = true;
  return texture;
}

export function disposeTexture(texture: Texture | null | undefined): void {
  texture?.dispose();
}

export function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials.filter(Boolean) as Material[]) {
      const candidate = material as Material & { map?: Texture | null };
      candidate.map?.dispose();
      candidate.dispose();
    }
  });
}

export function createPaperNoiseCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return canvas;

  const image = context.createImageData(size, size);
  let seed = 0x41c6ce57;
  for (let index = 0; index < image.data.length; index += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const shade = 220 + ((seed >>> 24) % 30);
    image.data[index] = shade;
    image.data[index + 1] = Math.max(0, shade - 3);
    image.data[index + 2] = Math.max(0, shade - 8);
    image.data[index + 3] = 4;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
