import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
} from 'three';
import { PageSurfaceCache } from '../../cache/PageSurfaceCache';
import { getGutterEdgeInfluence, getGutterOffset } from '../turn/PageCurl';
import { getStackThicknesses, getTotalPaperThickness, type BookConfig } from '../BookConfig';
import { createPaperNoiseCanvas, disposeObject } from '../three-utils';
import { TurningSheet } from './TurningSheet';

interface BookModelOptions {
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  config: Readonly<BookConfig>;
  maxAnisotropy: number;
  gpuTextureBudgetBytes: number;
}

type PageSide = 'left' | 'right';

export class BookModel {
  readonly root = new Group();
  readonly leftHalf = new Group();
  readonly rightHalf = new Group();
  readonly turningSheet: TurningSheet;
  readonly #frontCoverPivot = new Group();
  readonly #backCoverPivot = new Group();
  readonly #leftPage: Mesh<PlaneGeometry>;
  readonly #rightPage: Mesh<PlaneGeometry>;
  readonly #leftPageMaterial: MeshStandardMaterial;
  readonly #rightPageMaterial: MeshStandardMaterial;
  readonly #frontCoverMaterial: MeshStandardMaterial;
  readonly #leftStack: Mesh<BoxGeometry>;
  readonly #rightStack: Mesh<BoxGeometry>;
  readonly #leftPageEdges = new Group();
  readonly #rightPageEdges = new Group();
  readonly #gutterShadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly #openingLeaves: Group[] = [];
  readonly #backOpeningLeaves: Group[] = [];
  readonly #spine: Mesh<BoxGeometry>;
  readonly #pageWidth: number;
  readonly #pageCount: number;
  readonly #totalThickness: number;
  readonly #config: Readonly<BookConfig>;
  readonly #surfaceCache: PageSurfaceCache;
  #leftTexture: CanvasTexture | null = null;
  #rightTexture: CanvasTexture | null = null;
  #coverTexture: CanvasTexture | null = null;

  constructor(options: BookModelOptions) {
    this.#pageWidth = options.pageWidth;
    this.#pageCount = options.pageCount;
    this.#config = options.config;
    this.#surfaceCache = new PageSurfaceCache(options.gpuTextureBudgetBytes, options.maxAnisotropy);
    const paperRoughness = new CanvasTexture(createPaperNoiseCanvas(128));
    paperRoughness.wrapS = RepeatWrapping;
    paperRoughness.wrapT = RepeatWrapping;
    paperRoughness.repeat.set(3, 5);
    paperRoughness.needsUpdate = true;

    const totalThickness = getTotalPaperThickness(options.pageCount, options.config);
    this.#totalThickness = totalThickness;
    const pageMaterial = () =>
      new MeshStandardMaterial({
        color: 0xfffdf7,
        metalness: 0,
        roughness: 0.91,
        roughnessMap: paperRoughness,
      });
    this.#leftPageMaterial = pageMaterial();
    this.#rightPageMaterial = pageMaterial();
    this.#leftPage = createStaticPage('left', options, this.#leftPageMaterial);
    this.#rightPage = createStaticPage('right', options, this.#rightPageMaterial);

    const stackMaterial = new MeshStandardMaterial({
      color: 0xe8dfd1,
      metalness: 0,
      roughness: 0.98,
      roughnessMap: paperRoughness,
    });
    this.#leftStack = new Mesh(
      new BoxGeometry(options.pageWidth * 0.992, options.pageHeight * 0.994, 1),
      stackMaterial,
    );
    this.#rightStack = new Mesh(
      new BoxGeometry(options.pageWidth * 0.992, options.pageHeight * 0.994, 1),
      stackMaterial,
    );
    this.#leftStack.position.x = -options.pageWidth / 2;
    this.#rightStack.position.x = options.pageWidth / 2;
    this.#leftStack.receiveShadow = true;
    this.#rightStack.receiveShadow = true;

    const coverWidth = options.pageWidth * options.config.coverOversize;
    const coverHeight = options.pageHeight * options.config.coverOversize;
    const coverMaterial = new MeshStandardMaterial({
      color: 0x5d3327,
      metalness: 0,
      roughness: 0.73,
    });
    const backCover = new Mesh(
      new BoxGeometry(coverWidth, coverHeight, options.config.coverThickness),
      coverMaterial,
    );
    backCover.position.x = coverWidth / 2;
    backCover.position.z = -options.config.coverThickness / 2;
    backCover.castShadow = true;
    backCover.receiveShadow = true;
    this.#backCoverPivot.position.z = -totalThickness;
    this.#backCoverPivot.add(backCover);

    this.#frontCoverMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.72,
    });
    const frontCover = new Mesh(
      createFrontCoverGeometry(coverWidth, coverHeight, options.config.coverThickness),
      Array.from({ length: 6 }, (_, materialIndex) =>
        materialIndex === 4
          ? this.#frontCoverMaterial
          : new MeshStandardMaterial({
              color: 0x5d3327,
              metalness: 0,
              roughness: 0.73,
            }),
      ),
    );
    frontCover.position.x = coverWidth / 2;
    frontCover.position.z = options.config.coverThickness / 2 + 0.006;
    frontCover.castShadow = true;
    this.#frontCoverPivot.add(frontCover);

    for (let index = 0; index < 7; index += 1) {
      const leaf = new Group();
      const geometry = new PlaneGeometry(
        options.pageWidth * 0.996,
        options.pageHeight * 0.996,
        8,
        2,
      );
      geometry.translate(-options.pageWidth / 2, 0, 0);
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({
          color: 0xeee3d3,
          metalness: 0,
          roughness: 0.94,
          roughnessMap: paperRoughness,
        }),
      );
      mesh.castShadow = true;
      leaf.position.z = -0.0025 * (index + 1);
      leaf.add(mesh);
      this.#openingLeaves.push(leaf);

      const backLeaf = new Group();
      const backGeometry = new PlaneGeometry(
        options.pageWidth * 0.996,
        options.pageHeight * 0.996,
        8,
        2,
      );
      backGeometry.translate(options.pageWidth / 2, 0, 0);
      const backMesh = new Mesh(
        backGeometry,
        new MeshStandardMaterial({
          color: 0xe9ddcc,
          metalness: 0,
          roughness: 0.95,
          roughnessMap: paperRoughness,
        }),
      );
      backMesh.castShadow = true;
      backLeaf.add(backMesh);
      this.#backOpeningLeaves.push(backLeaf);
    }

    this.#spine = new Mesh(
      new BoxGeometry(options.config.coverThickness * 0.9, coverHeight, totalThickness * 1.6),
      new MeshStandardMaterial({ color: 0x422219, metalness: 0, roughness: 0.78 }),
    );
    this.#spine.position.z = -totalThickness * 0.8;
    this.#spine.castShadow = true;

    const gutterTexture = new CanvasTexture(createGutterShadowCanvas());
    gutterTexture.needsUpdate = true;
    this.#gutterShadow = new Mesh(
      new PlaneGeometry(options.pageWidth * 0.09, options.pageHeight * 0.982),
      new MeshBasicMaterial({
        map: gutterTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.#gutterShadow.position.z = 0.0065;
    this.#gutterShadow.renderOrder = 2;

    this.leftHalf.add(this.#leftStack, this.#leftPage, this.#leftPageEdges);
    this.rightHalf.add(this.#rightStack, this.#rightPage, this.#rightPageEdges);
    this.root.add(
      this.#backCoverPivot,
      this.leftHalf,
      this.rightHalf,
      ...this.#openingLeaves,
      ...this.#backOpeningLeaves,
      this.#frontCoverPivot,
      this.#spine,
      this.#gutterShadow,
    );
    addVisiblePageEdges(this.#leftPageEdges, this.#rightPageEdges, options, totalThickness);

    this.turningSheet = new TurningSheet({
      pageWidth: options.pageWidth,
      pageHeight: options.pageHeight,
      config: options.config,
      paperRoughness,
      acquireTexture: (canvas) => this.#surfaceCache.acquire(canvas),
      releaseTexture: (texture) => this.#surfaceCache.release(texture),
    });
    this.turningSheet.mesh.position.z = 0.004;
    this.root.add(this.turningSheet.mesh);
    this.setProgress(0);
    this.#setBackOpeningLeaves(1);
    this.setOpenProgress(0);
  }

  setCover(canvas: HTMLCanvasElement): void {
    const previous = this.#coverTexture;
    this.#coverTexture = this.#surfaceCache.acquire(canvas);
    this.#surfaceCache.release(previous);
    this.#frontCoverMaterial.map = this.#coverTexture;
    this.#frontCoverMaterial.needsUpdate = true;
    this.#pruneSurfaces();
  }

  setStaticPages(left: HTMLCanvasElement | null, right: HTMLCanvasElement | null): void {
    const previousLeft = this.#leftTexture;
    const previousRight = this.#rightTexture;
    this.#leftTexture = left ? this.#surfaceCache.acquire(left) : null;
    this.#rightTexture = right ? this.#surfaceCache.acquire(right) : null;
    this.#surfaceCache.release(previousLeft);
    this.#surfaceCache.release(previousRight);
    this.#leftPageMaterial.map = this.#leftTexture;
    this.#rightPageMaterial.map = this.#rightTexture;
    this.#leftPageMaterial.needsUpdate = true;
    this.#rightPageMaterial.needsUpdate = true;
    this.#leftPage.visible = Boolean(left);
    this.#rightPage.visible = Boolean(right);
    this.#pruneSurfaces();
  }

  setStaticPageVisibility(side: PageSide, visible: boolean): void {
    (side === 'left' ? this.#leftPage : this.#rightPage).visible = visible;
  }

  setProgress(progress: number): void {
    const total = getTotalPaperThickness(this.#pageCount, this.#config);
    const stacks = getStackThicknesses(progress, total, this.#config.minimumStackThickness);
    this.#setStack(this.#leftStack, stacks.left, -1);
    this.#setStack(this.#rightStack, stacks.right, 1);
    this.#leftPage.position.z = 0.002;
    this.#rightPage.position.z = 0.002;
  }

  #setStack(stack: Mesh<BoxGeometry>, thickness: number, side: -1 | 1): void {
    stack.scale.z = Math.max(0.001, thickness);
    stack.position.z = -thickness / 2;
    stack.position.x = (side * this.#pageWidth) / 2;
  }

  setOpenProgress(progress: number): void {
    const coverProgress = phaseProgress(progress, 0, 0.78);
    const pageProgress = phaseProgress(progress, 0.12, 1);
    const centeringProgress = phaseProgress(progress, 0.06, 0.92);
    this.root.position.x = (-this.#pageWidth / 2) * (1 - centeringProgress);
    this.#frontCoverPivot.position.z =
      (-this.#totalThickness + 0.006) * coverProgress + Math.sin(Math.PI * coverProgress) * 0.045;
    this.#frontCoverPivot.rotation.y = Math.PI * coverProgress;
    this.leftHalf.position.z = Math.sin(Math.PI * pageProgress) * 0.018;
    this.leftHalf.rotation.y = Math.PI * (1 - pageProgress);
    this.#setOpeningLeaves(progress);
    this.#setPageEdgesVisible(pageProgress);
    this.#spine.visible = pageProgress < 0.9;
  }

  setBackOpenProgress(progress: number): void {
    const coverProgress = phaseProgress(progress, 0, 0.78);
    const pageProgress = phaseProgress(progress, 0.12, 1);
    const centeringProgress = phaseProgress(progress, 0.06, 0.92);
    this.root.position.x = (this.#pageWidth / 2) * (1 - centeringProgress);
    this.#backCoverPivot.position.z =
      -this.#totalThickness * coverProgress + Math.sin(Math.PI * coverProgress) * 0.045;
    this.#backCoverPivot.rotation.y = Math.PI * (1 - coverProgress);
    this.rightHalf.position.z = Math.sin(Math.PI * pageProgress) * 0.018;
    this.rightHalf.rotation.y = Math.PI * (1 - pageProgress);
    this.#setBackOpeningLeaves(progress);
    this.#setPageEdgesVisible(pageProgress);
    this.#spine.visible = pageProgress < 0.9;
  }

  beginBoundaryTurn(edge: 'front' | 'back'): void {
    this.#frontCoverPivot.visible = edge !== 'front';
    this.#backCoverPivot.visible = edge !== 'back';
    this.leftHalf.rotation.y = 0;
    this.leftHalf.position.z = 0;
    this.rightHalf.rotation.y = 0;
    this.rightHalf.position.z = 0;
    this.leftHalf.visible = edge !== 'front';
    this.rightHalf.visible = edge !== 'back';
    for (const leaf of this.#openingLeaves) leaf.visible = false;
    for (const leaf of this.#backOpeningLeaves) leaf.visible = false;
    this.#setPageEdgesVisible(1);
    this.#spine.visible = false;
  }

  setBoundaryOpenProgress(progress: number, edge: 'front' | 'back'): void {
    const openProgress = Math.min(1, Math.max(0, progress));
    const closedOffset = edge === 'front' ? -this.#pageWidth / 2 : this.#pageWidth / 2;
    this.root.position.x = closedOffset * (1 - openProgress);
  }

  settleBoundaryTurn(edge: 'front' | 'back', open: boolean): void {
    if (edge === 'front') this.setOpenProgress(open ? 1 : 0);
    else this.setBackOpenProgress(open ? 1 : 0);
    this.#frontCoverPivot.visible = true;
    this.#backCoverPivot.visible = true;
    this.leftHalf.visible = true;
    this.rightHalf.visible = true;
    for (const leaf of this.#openingLeaves) leaf.visible = false;
    for (const leaf of this.#backOpeningLeaves) leaf.visible = false;
  }

  pruneSurfaces(): void {
    this.#pruneSurfaces();
  }

  prewarmSurfaces(canvases: readonly HTMLCanvasElement[]): CanvasTexture[] {
    const textures = canvases.map((canvas) => this.#surfaceCache.warm(canvas));
    this.#pruneSurfaces();
    return textures;
  }

  get surfaceMetrics(): Readonly<{ entries: number; byteSize: number; maxBytes: number }> {
    return {
      entries: this.#surfaceCache.size,
      byteSize: this.#surfaceCache.byteSize,
      maxBytes: this.#surfaceCache.maxBytes,
    };
  }

  #pruneSurfaces(): void {
    this.#surfaceCache.prune();
  }

  setClosedFromOpenProgress(progress: number): void {
    this.setOpenProgress(1 - progress);
  }

  setBackClosedFromOpenProgress(progress: number): void {
    this.setBackOpenProgress(1 - progress);
  }

  #setPageEdgesVisible(openProgress: number): void {
    const visible = openProgress > 0.14;
    this.#leftPageEdges.visible = visible;
    this.#rightPageEdges.visible = visible;
    this.#gutterShadow.visible = openProgress > 0.84;
  }

  #setOpeningLeaves(openProgress: number): void {
    for (let index = 0; index < this.#openingLeaves.length; index += 1) {
      const leafProgress = phaseProgress(openProgress, 0.04 + index * 0.026, 0.78 + index * 0.025);
      const leaf = this.#openingLeaves[index];
      leaf.rotation.y = Math.PI * (1 - leafProgress);
      leaf.position.z =
        -0.0025 * (index + 1) + Math.sin(Math.PI * leafProgress) * (0.025 - index * 0.0017);
    }
  }

  #setBackOpeningLeaves(openProgress: number): void {
    for (let index = 0; index < this.#backOpeningLeaves.length; index += 1) {
      const leafProgress = phaseProgress(openProgress, 0.04 + index * 0.026, 0.78 + index * 0.025);
      const leaf = this.#backOpeningLeaves[index];
      leaf.rotation.y = Math.PI * (1 - leafProgress);
      leaf.position.z =
        -0.0025 * (index + 1) * (1 - leafProgress) +
        (-this.#totalThickness + 0.0025 * (index + 1)) * leafProgress +
        Math.sin(Math.PI * leafProgress) * (0.025 - index * 0.0017);
    }
  }

  dispose(): void {
    this.#surfaceCache.release(this.#coverTexture);
    this.#surfaceCache.release(this.#leftTexture);
    this.#surfaceCache.release(this.#rightTexture);
    this.#coverTexture = null;
    this.#leftTexture = null;
    this.#rightTexture = null;
    this.turningSheet.dispose();
    this.#surfaceCache.clear();
    disposeObject(this.root);
  }
}

function createFrontCoverGeometry(width: number, height: number, depth: number): BoxGeometry {
  const geometry = new BoxGeometry(width, height, depth, 12, 1, 1);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const distanceFromSpine = Math.max(0, x + width / 2);
    const bend = Math.exp(-distanceFromSpine / Math.max(0.001, width * 0.11)) * depth * 0.16;
    positions.setZ(index, positions.getZ(index) + bend);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function phaseProgress(progress: number, start: number, end: number): number {
  const unit = Math.min(1, Math.max(0, (progress - start) / Math.max(0.001, end - start)));
  return unit * unit * (3 - 2 * unit);
}

function createStaticPage(
  side: PageSide,
  options: BookModelOptions,
  material: MeshStandardMaterial,
): Mesh<PlaneGeometry> {
  const geometry = new PlaneGeometry(
    options.pageWidth,
    options.pageHeight,
    options.config.widthSegments,
    options.config.heightSegments,
  );
  geometry.translate(side === 'left' ? -options.pageWidth / 2 : options.pageWidth / 2, 0, 0);
  const positions = geometry.attributes.position;
  const array = positions.array;
  for (let index = 0; index < array.length; index += 3) {
    const distance = Math.abs(Number(array[index]));
    const y = Number(array[index + 1]);
    positions.setXYZ(
      index / 3,
      Number(array[index]),
      y,
      getGutterOffset(distance, options.config, getGutterEdgeInfluence(y, options.pageHeight)),
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addVisiblePageEdges(
  leftPageEdges: Group,
  rightPageEdges: Group,
  options: BookModelOptions,
  totalThickness: number,
): void {
  const edgeMaterial = new MeshStandardMaterial({
    color: 0xcfc5b5,
    metalness: 0,
    roughness: 0.98,
  });
  for (let index = 0; index < 10; index += 1) {
    const level = (index + 1) / 11;
    for (const side of [-1, 1] as const) {
      const edge = new Mesh(
        new BoxGeometry(options.pageWidth * 0.986, 0.0011, 0.0009),
        edgeMaterial,
      );
      edge.position.x = (side * options.pageWidth) / 2 + Math.sin(index * 4.2) * 0.0008;
      edge.position.y = -options.pageHeight / 2 + 0.002 + index * 0.00135;
      edge.position.z = -totalThickness * level;
      (side === -1 ? leftPageEdges : rightPageEdges).add(edge);
    }
  }
}

function createGutterShadowCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 8;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, 'rgba(65, 43, 29, 0)');
  gradient.addColorStop(0.32, 'rgba(65, 43, 29, 0.035)');
  gradient.addColorStop(0.5, 'rgba(48, 29, 20, 0.15)');
  gradient.addColorStop(0.68, 'rgba(65, 43, 29, 0.035)');
  gradient.addColorStop(1, 'rgba(65, 43, 29, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
