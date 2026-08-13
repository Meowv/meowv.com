import {
  BufferGeometry,
  Float32BufferAttribute,
  FrontSide,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { type BookConfig } from '../BookConfig';
import { computePageCurlPoint, type TurnDirection } from '../turn/PageCurl';
import { createPageTexture, disposeTexture } from '../three-utils';

interface TurningSheetOptions {
  pageWidth: number;
  pageHeight: number;
  config: Pick<
    BookConfig,
    'widthSegments' | 'heightSegments' | 'curlStrength' | 'twistStrength' | 'sagStrength'
  >;
}

export class TurningSheet {
  readonly mesh: Mesh<BufferGeometry>;
  readonly #geometry: BufferGeometry;
  readonly #frontMaterial: MeshStandardMaterial;
  readonly #backMaterial: MeshStandardMaterial;
  readonly #edgeMaterial: MeshStandardMaterial;
  readonly #basePositions: Float32Array;
  readonly #pageWidth: number;
  readonly #pageHeight: number;
  readonly #config: TurningSheetOptions['config'];
  #frontTexture: ReturnType<typeof createPageTexture> | null = null;
  #backTexture: ReturnType<typeof createPageTexture> | null = null;

  constructor(options: TurningSheetOptions) {
    this.#pageWidth = options.pageWidth;
    this.#pageHeight = options.pageHeight;
    this.#config = options.config;
    const result = createTurningSheetGeometry(options);
    this.#geometry = result.geometry;
    this.#basePositions = result.basePositions;
    this.#frontMaterial = new MeshStandardMaterial({
      color: 0xfffdf8,
      metalness: 0,
      roughness: 0.9,
      side: FrontSide,
    });
    this.#backMaterial = new MeshStandardMaterial({
      color: 0xfffdf8,
      metalness: 0,
      roughness: 0.9,
      side: FrontSide,
    });
    this.#edgeMaterial = new MeshStandardMaterial({
      color: 0xd8d0c2,
      metalness: 0,
      roughness: 0.96,
    });
    this.mesh = new Mesh(this.#geometry, [
      this.#frontMaterial,
      this.#backMaterial,
      this.#edgeMaterial,
    ]);
    this.mesh.castShadow = true;
    // 双面纸层非常接近，接收自身阴影会把翻页面压成整块灰影；只让它向下方页面投影。
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
  }

  setPages(front: HTMLCanvasElement, back: HTMLCanvasElement, anisotropy = 2): void {
    disposeTexture(this.#frontTexture);
    disposeTexture(this.#backTexture);
    this.#frontTexture = createPageTexture(front, anisotropy);
    this.#backTexture = createPageTexture(back, anisotropy);
    this.#frontMaterial.map = this.#frontTexture;
    this.#backMaterial.map = this.#backTexture;
    this.mesh.visible = true;
  }

  update(progress: number, direction: TurnDirection, pointerV = 0.82, verticalDrag = 0): void {
    const positions = this.#geometry.attributes.position;
    const vertexCount = this.#basePositions.length / 3;
    for (let index = 0; index < vertexCount; index += 1) {
      const offset = index * 3;
      const point = computePageCurlPoint({
        x: this.#basePositions[offset],
        y: this.#basePositions[offset + 1],
        pageWidth: this.#pageWidth,
        pageHeight: this.#pageHeight,
        progress,
        direction,
        pointerV,
        verticalDrag,
        curlStrength: this.#config.curlStrength,
        twistStrength: this.#config.twistStrength,
        sagStrength: this.#config.sagStrength,
      });
      positions.setXYZ(index, point.x, point.y, point.z + this.#basePositions[offset + 2]);
    }
    positions.needsUpdate = true;
    this.#geometry.computeVertexNormals();
    this.#geometry.computeBoundingSphere();
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    disposeTexture(this.#frontTexture);
    disposeTexture(this.#backTexture);
    this.#frontTexture = null;
    this.#backTexture = null;
    this.#geometry.dispose();
    this.#frontMaterial.dispose();
    this.#backMaterial.dispose();
    this.#edgeMaterial.dispose();
  }
}

function createTurningSheetGeometry({ pageWidth, pageHeight, config }: TurningSheetOptions): {
  geometry: BufferGeometry;
  basePositions: Float32Array;
} {
  const columns = config.widthSegments + 1;
  const rows = config.heightSegments + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const frontIndices: number[] = [];
  const backIndices: number[] = [];
  const edgeIndices: number[] = [];

  for (let side = 0; side < 2; side += 1) {
    for (let row = 0; row < rows; row += 1) {
      const v = row / config.heightSegments;
      for (let column = 0; column < columns; column += 1) {
        const u = column / config.widthSegments;
        positions.push(u * pageWidth, (v - 0.5) * pageHeight, side === 0 ? 0.0007 : -0.0007);
        uvs.push(side === 0 ? u : 1 - u, v);
      }
    }
  }

  const sideVertexCount = columns * rows;
  for (let row = 0; row < config.heightSegments; row += 1) {
    for (let column = 0; column < config.widthSegments; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      frontIndices.push(a, b, c, b, d, c);
      const offset = sideVertexCount;
      backIndices.push(a + offset, c + offset, b + offset, b + offset, c + offset, d + offset);
    }
  }

  const addEdge = (frontA: number, frontB: number): void => {
    const backA = frontA + sideVertexCount;
    const backB = frontB + sideVertexCount;
    edgeIndices.push(frontA, backA, frontB, frontB, backA, backB);
  };
  for (let row = 0; row < config.heightSegments; row += 1) {
    addEdge(row * columns + config.widthSegments, (row + 1) * columns + config.widthSegments);
  }
  for (let column = 0; column < config.widthSegments; column += 1) {
    addEdge(column, column + 1);
    addEdge((rows - 1) * columns + column + 1, (rows - 1) * columns + column);
  }

  const indices = [...frontIndices, ...backIndices, ...edgeIndices];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(0, frontIndices.length, 0);
  geometry.addGroup(frontIndices.length, backIndices.length, 1);
  geometry.addGroup(frontIndices.length + backIndices.length, edgeIndices.length, 2);
  geometry.computeVertexNormals();
  return { geometry, basePositions: new Float32Array(positions) };
}
