import { type Material, type Mesh, type Object3D, type Texture } from 'three';

export function disposeTexture(texture: Texture | null | undefined): void {
  texture?.dispose();
}

export function disposeObject(root: Object3D): void {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of meshMaterials.filter(Boolean) as Material[]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (
          value &&
          typeof value === 'object' &&
          'isTexture' in value &&
          (value as Texture).isTexture
        ) {
          textures.add(value as Texture);
        }
      }
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
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
