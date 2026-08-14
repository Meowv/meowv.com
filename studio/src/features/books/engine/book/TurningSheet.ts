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
    | 'coverOversize'
    | 'coverThickness'
    | 'widthSegments'
    | 'heightSegments'
    | 'gutterDepth'
    | 'gutterFalloff'
    | 'curlStrength'
    | 'twistStrength'
    | 'sagStrength'
  >;
  totalThickness: number;
  paperRoughness: Texture;
  acquireTexture(canvas: HTMLCanvasElement): CanvasTexture;
  releaseTexture(texture: CanvasTexture | null | undefined): void;
}

const SHEET_HALF_THICKNESS = 0.0012;
export const FRONT_COVER_CLEARANCE = 0.006;
export const STATIC_PAGE_SURFACE_Z = 0.002;
const TURNING_PAGE_CLEARANCE = 0.0008;
export const TURNING_PAGE_READY_LIFT = SHEET_HALF_THICKNESS * 2 + TURNING_PAGE_CLEARANCE;
const TURNING_PAGE_SURFACE_Z =
  STATIC_PAGE_SURFACE_Z + SHEET_HALF_THICKNESS + TURNING_PAGE_CLEARANCE;
const COVER_INSET_OFFSET = 0.0008;
const PAPER_EDGE_COLOR = 0xd8d0c2;
const COVER_EDGE_COLOR = 0x5d3327;
const COVER_BOARD_COLOR = 0x5d3327;
const COVER_CURL_SCALE = 0.08;
const COVER_TWIST_SCALE = 0.15;
const COVER_SAG_SCALE = 0.25;
const COVER_CORNER_PICKUP_SCALE = 0;
const BOARD_VERTEX = 0;
const FRONT_INSET_VERTEX = 1;
const BACK_INSET_VERTEX = 2;

export class TurningSheet {
  readonly mesh: Mesh<BufferGeometry>;
  readonly #geometry: BufferGeometry;
  readonly #frontMaterial: MeshStandardMaterial;
  readonly #backMaterial: MeshStandardMaterial;
  readonly #edgeMaterial: MeshStandardMaterial;
  readonly #frontInsetMaterial: MeshStandardMaterial;
  readonly #backInsetMaterial: MeshStandardMaterial;
  readonly #basePositions: Float32Array;
  readonly #vertexKinds: Uint8Array;
  readonly #boardVertexCount: number;
  readonly #paperIndexCount: number;
  readonly #pageWidth: number;
  readonly #pageHeight: number;
  readonly #totalThickness: number;
  readonly #config: TurningSheetOptions['config'];
  readonly #acquireTexture: TurningSheetOptions['acquireTexture'];
  readonly #releaseTexture: TurningSheetOptions['releaseTexture'];
  readonly #curlPoint = new Float32Array(3);
  readonly #curlFrame: PageCurlFrame;
  #frontTexture: CanvasTexture | null = null;
  #backTexture: CanvasTexture | null = null;
  #edgeKind: 'paper' | 'cover' = 'paper';
  #coverSide: 'front' | 'back' = 'front';

  constructor(options: TurningSheetOptions) {
    this.#pageWidth = options.pageWidth;
    this.#pageHeight = options.pageHeight;
    this.#totalThickness = options.totalThickness;
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
      cornerPickupStrength: 1,
    };
    const result = createTurningSheetGeometry(options);
    this.#geometry = result.geometry;
    this.#basePositions = result.basePositions;
    this.#vertexKinds = result.vertexKinds;
    this.#boardVertexCount = result.boardVertexCount;
    this.#paperIndexCount = result.paperIndexCount;
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
      color: PAPER_EDGE_COLOR,
      metalness: 0,
      roughness: 0.96,
      roughnessMap: options.paperRoughness,
    });
    this.#frontInsetMaterial = new MeshStandardMaterial({
      color: 0xfffdf8,
      metalness: 0,
      roughness: 0.9,
      roughnessMap: options.paperRoughness,
      side: FrontSide,
      visible: false,
    });
    this.#backInsetMaterial = this.#frontInsetMaterial.clone();
    this.mesh = new Mesh(this.#geometry, [
      this.#frontMaterial,
      this.#backMaterial,
      this.#edgeMaterial,
      this.#frontInsetMaterial,
      this.#backInsetMaterial,
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
    this.#applyMaterialMode();
    this.mesh.visible = true;
  }

  setEdgeKind(kind: 'paper' | 'cover', coverSide: 'front' | 'back' = 'front'): void {
    this.#edgeKind = kind;
    this.#coverSide = coverSide;
    this.#edgeMaterial.color.setHex(kind === 'cover' ? COVER_EDGE_COLOR : PAPER_EDGE_COLOR);
    this.#applyMaterialMode();
  }

  update(progress: number, direction: TurnDirection, pointerV = 0.82, verticalDrag = 0): void {
    const positions = this.#geometry.attributes.position;
    const positionArray = positions.array as Float32Array;
    const coverTurn = this.#edgeKind === 'cover';
    const vertexCount = coverTurn ? this.#basePositions.length / 3 : this.#boardVertexCount;
    const safeProgress = Math.min(1, Math.max(0, progress));
    // 纸面平铺贴合（就绪/趋平）时看不到纸页厚度与投影，
    // 只在中段竖起时显示纸边和投影，避免"页面浮起一层纸"的错觉。
    const settled = Math.min(safeProgress, 1 - safeProgress);
    const paperEdgeVisible = coverTurn || settled > 0.08;
    if (this.#edgeMaterial.visible !== paperEdgeVisible) {
      this.#edgeMaterial.visible = paperEdgeVisible;
      this.mesh.castShadow = paperEdgeVisible;
    }
    this.#curlFrame.progress = safeProgress;
    this.#curlFrame.direction = direction;
    this.#curlFrame.pointerV = pointerV;
    this.#curlFrame.verticalDrag = verticalDrag;
    this.#curlFrame.curlStrength = this.#config.curlStrength * (coverTurn ? COVER_CURL_SCALE : 1);
    this.#curlFrame.twistStrength =
      this.#config.twistStrength * (coverTurn ? COVER_TWIST_SCALE : 1);
    this.#curlFrame.sagStrength = this.#config.sagStrength * (coverTurn ? COVER_SAG_SCALE : 1);
    this.#curlFrame.cornerPickupStrength = coverTurn ? COVER_CORNER_PICKUP_SCALE : 1;
    let coverOpenProgress = 0;
    if (coverTurn) {
      const openingDirection: TurnDirection = this.#coverSide === 'front' ? 'forward' : 'backward';
      coverOpenProgress = direction === openingDirection ? safeProgress : 1 - safeProgress;
      const coverHalfThickness = this.#config.coverThickness / 2;
      const closedCenter =
        coverHalfThickness + (this.#coverSide === 'front' ? FRONT_COVER_CLEARANCE : 0);
      const openCenter = -this.#totalThickness - coverHalfThickness;
      this.mesh.position.z = closedCenter + (openCenter - closedCenter) * coverOpenProgress;
    } else {
      this.mesh.position.z = TURNING_PAGE_SURFACE_Z;
    }
    const coverWidth = this.#pageWidth * this.#config.coverOversize;
    for (let index = 0; index < vertexCount; index += 1) {
      const offset = index * 3;
      const vertexKind = this.#vertexKinds[index];
      const coverBoard = coverTurn && vertexKind === BOARD_VERTEX;
      const surfaceScale = coverBoard ? this.#config.coverOversize : 1;
      const surfaceWidth = this.#pageWidth * surfaceScale;
      const surfaceHeight = this.#pageHeight * surfaceScale;
      const baseX = this.#basePositions[offset] * surfaceScale;
      const y = this.#basePositions[offset + 1] * surfaceScale;
      const distanceFromSpine = Math.abs(baseX);
      const baseSurfaceOffset = this.#basePositions[offset + 2];
      const coverBend =
        coverTurn && this.#coverSide === 'front'
          ? getFrontCoverSpineBend(distanceFromSpine, coverWidth, this.#config.coverThickness)
          : 0;
      let surfaceOffset = baseSurfaceOffset;
      if (coverTurn) {
        const coverHalfThickness = this.#config.coverThickness / 2;
        surfaceOffset =
          vertexKind === FRONT_INSET_VERTEX
            ? coverHalfThickness + COVER_INSET_OFFSET + coverBend
            : vertexKind === BACK_INSET_VERTEX
              ? -coverHalfThickness - COVER_INSET_OFFSET + coverBend
              : Math.sign(baseSurfaceOffset) * coverHalfThickness + coverBend;
      }
      this.#curlFrame.pageWidth = surfaceWidth;
      this.#curlFrame.pageHeight = surfaceHeight;
      writePageCurlPoint(this.#curlPoint, 0, baseX, y, this.#curlFrame, surfaceOffset);
      const gutterOffset = getGutterOffset(
        distanceFromSpine,
        this.#config,
        getGutterEdgeInfluence(y, surfaceHeight),
      );
      const insetLiftProgress = smoothstep(0.35, 1, coverOpenProgress);
      const insetLift =
        coverTurn && vertexKind !== BOARD_VERTEX
          ? (this.#totalThickness -
              COVER_INSET_OFFSET +
              STATIC_PAGE_SURFACE_Z +
              getGutterOffset(
                distanceFromSpine,
                this.#config,
                getGutterEdgeInfluence(y, this.#pageHeight),
              ) +
              (this.#coverSide === 'front' ? coverBend : 0)) *
            insetLiftProgress
          : 0;
      positionArray[offset] = this.#curlPoint[0];
      positionArray[offset + 1] = this.#curlPoint[1];
      positionArray[offset + 2] = this.#curlPoint[2] + insetLift + (coverTurn ? 0 : gutterOffset);
    }
    positions.needsUpdate = true;
    updateNormals(this.#geometry, coverTurn ? undefined : this.#paperIndexCount);
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
    this.#frontInsetMaterial.dispose();
    this.#backInsetMaterial.dispose();
  }

  #applyMaterialMode(): void {
    const coverTurn = this.#edgeKind === 'cover';
    const frontCover = coverTurn && this.#coverSide === 'front';
    const backCover = coverTurn && this.#coverSide === 'back';
    this.#frontMaterial.color.setHex(backCover ? COVER_BOARD_COLOR : 0xfffdf8);
    this.#backMaterial.color.setHex(frontCover ? COVER_BOARD_COLOR : 0xfffdf8);
    setMaterialMap(this.#frontMaterial, backCover ? null : this.#frontTexture);
    setMaterialMap(this.#backMaterial, frontCover ? null : this.#backTexture);
    setMaterialMap(this.#frontInsetMaterial, backCover ? this.#frontTexture : null);
    setMaterialMap(this.#backInsetMaterial, frontCover ? this.#backTexture : null);
    this.#frontInsetMaterial.visible = backCover;
    this.#backInsetMaterial.visible = frontCover;
  }
}

function setMaterialMap(material: MeshStandardMaterial, map: CanvasTexture | null): void {
  if (material.map === map) return;
  material.map = map;
  material.needsUpdate = true;
}

export function getFrontCoverSpineBend(
  distanceFromSpine: number,
  width: number,
  depth: number,
): number {
  return Math.exp(-Math.max(0, distanceFromSpine) / Math.max(0.001, width * 0.11)) * depth * 0.16;
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const unit = Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
  return unit * unit * (3 - 2 * unit);
}

function updateNormals(geometry: BufferGeometry, indexCount?: number): void {
  const positions = geometry.attributes.position.array as Float32Array;
  const normals = geometry.attributes.normal.array as Float32Array;
  const indices = geometry.index?.array;
  if (!indices) return;
  normals.fill(0);
  const activeIndexCount = Math.min(indices.length, indexCount ?? indices.length);
  for (let offset = 0; offset < activeIndexCount; offset += 3) {
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
  vertexKinds: Uint8Array;
  boardVertexCount: number;
  paperIndexCount: number;
} {
  const columns = config.widthSegments + 1;
  const rows = config.heightSegments + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const vertexKinds: number[] = [];
  const frontIndices: number[] = [];
  const backIndices: number[] = [];
  const edgeIndices: number[] = [];
  const frontInsetIndices: number[] = [];
  const backInsetIndices: number[] = [];

  for (let side = 0; side < 2; side += 1) {
    for (let row = 0; row < rows; row += 1) {
      const v = row / config.heightSegments;
      for (let column = 0; column < columns; column += 1) {
        const u = column / config.widthSegments;
        positions.push(
          u * pageWidth,
          (v - 0.5) * pageHeight,
          side === 0 ? SHEET_HALF_THICKNESS : -SHEET_HALF_THICKNESS,
        );
        uvs.push(side === 0 ? u : 1 - u, v);
        vertexKinds.push(BOARD_VERTEX);
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

  const addEdgeStrip = (points: ReadonlyArray<readonly [number, number]>): void => {
    const start = positions.length / 3;
    const last = Math.max(1, points.length - 1);
    for (let index = 0; index < points.length; index += 1) {
      const [x, y] = points[index];
      const u = index / last;
      positions.push(x, y, SHEET_HALF_THICKNESS, x, y, -SHEET_HALF_THICKNESS);
      uvs.push(u, 1, u, 0);
      vertexKinds.push(BOARD_VERTEX, BOARD_VERTEX);
    }
    for (let index = 0; index < points.length - 1; index += 1) {
      const frontA = start + index * 2;
      const backA = frontA + 1;
      const frontB = frontA + 2;
      const backB = frontA + 3;
      edgeIndices.push(frontA, backA, frontB, frontB, backA, backB);
    }
  };
  addEdgeStrip(
    Array.from(
      { length: rows },
      (_, row) => [pageWidth, (row / config.heightSegments - 0.5) * pageHeight] as const,
    ),
  );
  addEdgeStrip(
    Array.from(
      { length: columns },
      (_, column) => [(column / config.widthSegments) * pageWidth, -pageHeight / 2] as const,
    ),
  );
  addEdgeStrip(
    Array.from(
      { length: columns },
      (_, index) =>
        [
          ((config.widthSegments - index) / config.widthSegments) * pageWidth,
          pageHeight / 2,
        ] as const,
    ),
  );

  const boardVertexCount = positions.length / 3;
  const paperIndexCount = frontIndices.length + backIndices.length + edgeIndices.length;

  const addInsetSurface = (side: 'front' | 'back'): void => {
    const start = positions.length / 3;
    const targetIndices = side === 'front' ? frontInsetIndices : backInsetIndices;
    for (let row = 0; row < rows; row += 1) {
      const v = row / config.heightSegments;
      for (let column = 0; column < columns; column += 1) {
        const u = column / config.widthSegments;
        positions.push(
          u * pageWidth,
          (v - 0.5) * pageHeight,
          side === 'front' ? SHEET_HALF_THICKNESS : -SHEET_HALF_THICKNESS,
        );
        uvs.push(side === 'front' ? u : 1 - u, v);
        vertexKinds.push(side === 'front' ? FRONT_INSET_VERTEX : BACK_INSET_VERTEX);
      }
    }
    for (let row = 0; row < config.heightSegments; row += 1) {
      for (let column = 0; column < config.widthSegments; column += 1) {
        const a = start + row * columns + column;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        if (side === 'front') targetIndices.push(a, b, c, b, d, c);
        else targetIndices.push(a, c, b, b, c, d);
      }
    }
  };
  addInsetSurface('front');
  addInsetSurface('back');

  const indices = [
    ...frontIndices,
    ...backIndices,
    ...edgeIndices,
    ...frontInsetIndices,
    ...backInsetIndices,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(0, frontIndices.length, 0);
  geometry.addGroup(frontIndices.length, backIndices.length, 1);
  geometry.addGroup(frontIndices.length + backIndices.length, edgeIndices.length, 2);
  geometry.addGroup(
    frontIndices.length + backIndices.length + edgeIndices.length,
    frontInsetIndices.length,
    3,
  );
  geometry.addGroup(
    frontIndices.length + backIndices.length + edgeIndices.length + frontInsetIndices.length,
    backInsetIndices.length,
    4,
  );
  geometry.computeVertexNormals();
  return {
    geometry,
    basePositions: new Float32Array(positions),
    vertexKinds: new Uint8Array(vertexKinds),
    boardVertexCount,
    paperIndexCount,
  };
}
