import {
  BufferGeometry,
  Float32BufferAttribute,
  FrontSide,
  Mesh,
  MeshStandardMaterial,
  type CanvasTexture,
  type Texture,
} from 'three';
import { type BookConfig } from '../BookConfig';
import {
  getGutterEdgeInfluence,
  getGutterOffset,
  writePageCurlPoint,
  type PageCurlFrame,
  type TurnDirection,
} from '../turn/PageCurl';

interface TurningSheetOptions {
  pageWidth: number;
  pageHeight: number;
  config: Pick<
    BookConfig,
    | 'widthSegments'
    | 'heightSegments'
    | 'gutterDepth'
    | 'gutterFalloff'
    | 'curlStrength'
    | 'twistStrength'
    | 'sagStrength'
  >;
  paperRoughness: Texture;
  acquireTexture(canvas: HTMLCanvasElement): CanvasTexture;
  releaseTexture(texture: CanvasTexture | null | undefined): void;
}

export class TurningSheet {
  readonly mesh: Mesh<BufferGeometry>;
  readonly #geometry: BufferGeometry;
  readonly #frontMaterial: MeshStandardMaterial;
  readonly #backMaterial: MeshStandardMaterial;
  readonly #edgeMaterial: MeshStandardMaterial;
  readonly #basePositions: Float32Array;
  readonly #pageHeight: number;
  readonly #config: TurningSheetOptions['config'];
  readonly #acquireTexture: TurningSheetOptions['acquireTexture'];
  readonly #releaseTexture: TurningSheetOptions['releaseTexture'];
  readonly #curlPoint = new Float32Array(3);
  readonly #curlFrame: PageCurlFrame;
  #frontTexture: CanvasTexture | null = null;
  #backTexture: CanvasTexture | null = null;

  constructor(options: TurningSheetOptions) {
    this.#pageHeight = options.pageHeight;
    this.#config = options.config;
    this.#acquireTexture = options.acquireTexture;
    this.#releaseTexture = options.releaseTexture;
    this.#curlFrame = {
      pageWidth: options.pageWidth,
      pageHeight: options.pageHeight,
      progress: 0,
      direction: 'forward',
      pointerV: 0.82,
      verticalDrag: 0,
      curlStrength: options.config.curlStrength,
      twistStrength: options.config.twistStrength,
      sagStrength: options.config.sagStrength,
    };
    const result = createTurningSheetGeometry(options);
    this.#geometry = result.geometry;
    this.#basePositions = result.basePositions;
    this.#frontMaterial = new MeshStandardMaterial({
      color: 0xfffdf8,
      metalness: 0,
      roughness: 0.9,
      roughnessMap: options.paperRoughness,
      side: FrontSide,
    });
    this.#backMaterial = new MeshStandardMaterial({
      color: 0xfffdf8,
      metalness: 0,
      roughness: 0.9,
      roughnessMap: options.paperRoughness,
      side: FrontSide,
    });
    this.#edgeMaterial = new MeshStandardMaterial({
      color: 0xd8d0c2,
      metalness: 0,
      roughness: 0.96,
      roughnessMap: options.paperRoughness,
    });
    this.mesh = new Mesh(this.#geometry, [
      this.#frontMaterial,
      this.#backMaterial,
      this.#edgeMaterial,
    ]);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    // 双面纸层非常接近，接收自身阴影会把翻页面压成整块灰影；只让它向下方页面投影。
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
  }

  setPages(front: HTMLCanvasElement, back: HTMLCanvasElement): void {
    const previousFront = this.#frontTexture;
    const previousBack = this.#backTexture;
    this.#frontTexture = this.#acquireTexture(front);
    this.#backTexture = this.#acquireTexture(back);
    this.#releaseTexture(previousFront);
    this.#releaseTexture(previousBack);
    this.#frontMaterial.map = this.#frontTexture;
    this.#backMaterial.map = this.#backTexture;
    this.#frontMaterial.needsUpdate = true;
    this.#backMaterial.needsUpdate = true;
    this.mesh.visible = true;
  }

  update(progress: number, direction: TurnDirection, pointerV = 0.82, verticalDrag = 0): void {
    const positions = this.#geometry.attributes.position;
    const positionArray = positions.array as Float32Array;
    const vertexCount = this.#basePositions.length / 3;
    const settledGutter = 1 - Math.sin(Math.PI * Math.min(1, Math.max(0, progress)));
    this.#curlFrame.progress = progress;
    this.#curlFrame.direction = direction;
    this.#curlFrame.pointerV = pointerV;
    this.#curlFrame.verticalDrag = verticalDrag;
    for (let index = 0; index < vertexCount; index += 1) {
      const offset = index * 3;
      const distanceFromSpine = Math.abs(this.#basePositions[offset]);
      const y = this.#basePositions[offset + 1];
      writePageCurlPoint(this.#curlPoint, 0, this.#basePositions[offset], y, this.#curlFrame);
      positionArray[offset] = this.#curlPoint[0];
      positionArray[offset + 1] = this.#curlPoint[1];
      positionArray[offset + 2] =
        this.#curlPoint[2] +
        this.#basePositions[offset + 2] +
        getGutterOffset(
          distanceFromSpine,
          this.#config,
          getGutterEdgeInfluence(y, this.#pageHeight),
        ) *
          settledGutter;
    }
    positions.needsUpdate = true;
    updateNormals(this.#geometry);
  }

  hide(): void {
    this.mesh.visible = false;
  }

  get textures(): readonly CanvasTexture[] {
    return [this.#frontTexture, this.#backTexture].filter((texture): texture is CanvasTexture =>
      Boolean(texture),
    );
  }

  dispose(): void {
    this.#releaseTexture(this.#frontTexture);
    this.#releaseTexture(this.#backTexture);
    this.#frontTexture = null;
    this.#backTexture = null;
    this.#geometry.dispose();
    this.#frontMaterial.dispose();
    this.#backMaterial.dispose();
    this.#edgeMaterial.dispose();
  }
}

function updateNormals(geometry: BufferGeometry): void {
  const positions = geometry.attributes.position.array as Float32Array;
  const normals = geometry.attributes.normal.array as Float32Array;
  const indices = geometry.index?.array;
  if (!indices) return;
  normals.fill(0);
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = Number(indices[offset]) * 3;
    const b = Number(indices[offset + 1]) * 3;
    const c = Number(indices[offset + 2]) * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const x = normals[offset];
    const y = normals[offset + 1];
    const z = normals[offset + 2];
    const length = Math.hypot(x, y, z) || 1;
    normals[offset] = x / length;
    normals[offset + 1] = y / length;
    normals[offset + 2] = z / length;
  }
  geometry.attributes.normal.needsUpdate = true;
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
