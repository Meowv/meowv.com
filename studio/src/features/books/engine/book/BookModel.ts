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
import {
  computePageCurlPoint,
  getGutterEdgeInfluence,
  getGutterOffset,
  type TurnDirection,
} from '../turn/PageCurl';
import { getStackThicknesses, getTotalPaperThickness, type BookConfig } from '../BookConfig';
import { createPaperNoiseCanvas, disposeObject } from '../three-utils';
import {
  FRONT_COVER_CLEARANCE,
  getFrontCoverSpineBend,
  STATIC_PAGE_SURFACE_Z,
  TURNING_PAGE_CLEARANCE,
  TurningSheet,
} from './TurningSheet';

interface BookModelOptions {
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  config: Readonly<BookConfig>;
  maxAnisotropy: number;
  gpuTextureBudgetBytes: number;
}

type PageSide = 'left' | 'right';
type BookCornerTarget = PageSide | 'front-cover' | 'back-cover';
type BookCorner = 'top' | 'bottom';

export class BookModel {
  readonly root = new Group();
  readonly leftHalf = new Group();
  readonly rightHalf = new Group();
  readonly turningSheet: TurningSheet;
  readonly #frontCoverPivot = new Group();
  readonly #backCoverPivot = new Group();
  readonly #frontCover: Mesh<BoxGeometry>;
  readonly #backCover: Mesh<BoxGeometry>;
  readonly #leftPage: Mesh<PlaneGeometry>;
  readonly #rightPage: Mesh<PlaneGeometry>;
  readonly #leftPageBasePositions: Float32Array;
  readonly #rightPageBasePositions: Float32Array;
  readonly #frontCoverBasePositions: Float32Array;
  readonly #backCoverBasePositions: Float32Array;
  readonly #leftPageMaterial: MeshStandardMaterial;
  readonly #rightPageMaterial: MeshStandardMaterial;
  readonly #frontCoverMaterial: MeshStandardMaterial;
  readonly #leftStack: Mesh<BoxGeometry>;
  readonly #rightStack: Mesh<BoxGeometry>;
  readonly #leftPageEdges = new Group();
  readonly #rightPageEdges = new Group();
  readonly #gutterShadow = new Group();
  readonly #leftGutterShadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly #rightGutterShadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly #leftGutterShadowBasePositions: Float32Array;
  readonly #rightGutterShadowBasePositions: Float32Array;
  readonly #edgeContactShadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly #edgeContactShadowBasePositions: Float32Array;
  readonly #openingLeaves: Group[] = [];
  readonly #backOpeningLeaves: Group[] = [];
  readonly #spine: Mesh<BoxGeometry>;
  readonly #pageWidth: number;
  readonly #pageHeight: number;
  readonly #pageCount: number;
  readonly #totalThickness: number;
  readonly #config: Readonly<BookConfig>;
  readonly #surfaceCache: PageSurfaceCache;
  #leftTexture: CanvasTexture | null = null;
  #rightTexture: CanvasTexture | null = null;
  #coverTexture: CanvasTexture | null = null;
  #cornerLift: { target: BookCornerTarget; corner: BookCorner } | null = null;
  #turnPreparationPage: PageSide | null = null;
  #turnGutterPhase = 0;

  constructor(options: BookModelOptions) {
    this.#pageWidth = options.pageWidth;
    this.#pageHeight = options.pageHeight;
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
    this.#leftPageBasePositions = Float32Array.from(
      this.#leftPage.geometry.attributes.position.array,
    );
    this.#rightPageBasePositions = Float32Array.from(
      this.#rightPage.geometry.attributes.position.array,
    );

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
    this.#backCover = new Mesh(
      new BoxGeometry(coverWidth, coverHeight, options.config.coverThickness, 32, 20, 1),
      coverMaterial,
    );
    this.#backCover.position.x = coverWidth / 2;
    this.#backCover.position.z = -options.config.coverThickness / 2;
    this.#backCover.castShadow = true;
    this.#backCover.receiveShadow = true;
    this.#backCoverPivot.position.z = -totalThickness;
    this.#backCoverPivot.add(this.#backCover);
    this.#backCoverBasePositions = Float32Array.from(
      this.#backCover.geometry.attributes.position.array,
    );

    this.#frontCoverMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.72,
    });
    this.#frontCover = new Mesh(
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
    this.#frontCover.position.x = coverWidth / 2;
    this.#frontCover.position.z = options.config.coverThickness / 2 + FRONT_COVER_CLEARANCE;
    this.#frontCover.castShadow = true;
    this.#frontCoverPivot.add(this.#frontCover);
    this.#frontCoverBasePositions = Float32Array.from(
      this.#frontCover.geometry.attributes.position.array,
    );

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

    const gutterShadow = (side: PageSide) => {
      const texture = new CanvasTexture(createGutterShadowCanvas(side));
      texture.needsUpdate = true;
      const mesh = new Mesh(
        createGutterShadowGeometry(options, side),
        new MeshBasicMaterial({
          map: texture,
          opacity: 0.4,
          transparent: true,
          depthWrite: false,
        }),
      );
      mesh.renderOrder = 2;
      return mesh;
    };
    this.#leftGutterShadow = gutterShadow('left');
    this.#rightGutterShadow = gutterShadow('right');
    this.#leftGutterShadowBasePositions = Float32Array.from(
      this.#leftGutterShadow.geometry.attributes.position.array,
    );
    this.#rightGutterShadowBasePositions = Float32Array.from(
      this.#rightGutterShadow.geometry.attributes.position.array,
    );
    this.#gutterShadow.add(this.#leftGutterShadow, this.#rightGutterShadow);
    this.#gutterShadow.renderOrder = 2;

    const contactTexture = new CanvasTexture(createEdgeContactShadowCanvas());
    contactTexture.needsUpdate = true;
    this.#edgeContactShadow = new Mesh(
      new PlaneGeometry(options.pageWidth * 0.08, options.pageHeight * 0.99, 2, 12),
      new MeshBasicMaterial({
        map: contactTexture,
        opacity: 0,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.#edgeContactShadowBasePositions = Float32Array.from(
      this.#edgeContactShadow.geometry.attributes.position.array,
    );
    this.#edgeContactShadow.visible = false;
    this.#edgeContactShadow.renderOrder = 2;

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
      this.#edgeContactShadow,
    );
    addVisiblePageEdges(this.#leftPageEdges, this.#rightPageEdges, options, totalThickness);

    this.turningSheet = new TurningSheet({
      pageWidth: options.pageWidth,
      pageHeight: options.pageHeight,
      totalThickness,
      config: options.config,
      paperRoughness,
      acquireTexture: (canvas) => this.#surfaceCache.acquire(canvas),
      releaseTexture: (texture) => this.#surfaceCache.release(texture),
    });
    this.root.add(this.turningSheet.mesh);
    this.setProgress(0);
    this.#setBackOpeningLeaves(1);
    this.setOpenProgress(0);
  }

  setCover(canvas: HTMLCanvasElement): void {
    const previous = this.#coverTexture;
    this.#coverTexture = this.#surfaceCache.acquire(canvas);
    this.#surfaceCache.release(previous);
    setMaterialMap(this.#frontCoverMaterial, this.#coverTexture);
    this.#pruneSurfaces();
  }

  setStaticPages(left: HTMLCanvasElement | null, right: HTMLCanvasElement | null): void {
    const nextLeft = left ? this.#surfaceCache.acquire(left) : null;
    let nextRight: CanvasTexture | null;
    try {
      nextRight = right ? this.#surfaceCache.acquire(right) : null;
    } catch (reason) {
      this.#surfaceCache.release(nextLeft);
      throw reason;
    }
    const previousLeft = this.#leftTexture;
    const previousRight = this.#rightTexture;
    this.#leftTexture = nextLeft;
    this.#rightTexture = nextRight;
    this.#surfaceCache.release(previousLeft);
    this.#surfaceCache.release(previousRight);
    setMaterialMap(this.#leftPageMaterial, this.#leftTexture);
    setMaterialMap(this.#rightPageMaterial, this.#rightTexture);
    this.#leftPage.visible = Boolean(left);
    this.#rightPage.visible = Boolean(right);
    this.#pruneSurfaces();
  }

  setStaticPageVisibility(side: PageSide, visible: boolean): void {
    (side === 'left' ? this.#leftPage : this.#rightPage).visible = visible;
  }

  setTurnPreparationPage(side: PageSide | null): void {
    if (this.#turnPreparationPage === side) return;
    this.clearCornerLift();
    this.#turnPreparationPage = side;
    this.#setStaticPageSurfacePositions();
  }

  // 当前静态页对应的画布，供引擎判断纹理是否需要替换。
  get staticPageCanvases(): Readonly<{
    left: HTMLCanvasElement | null;
    right: HTMLCanvasElement | null;
  }> {
    return {
      left: (this.#leftTexture?.image as HTMLCanvasElement | undefined) ?? null,
      right: (this.#rightTexture?.image as HTMLCanvasElement | undefined) ?? null,
    };
  }

  setProgress(progress: number): void {
    const total = getTotalPaperThickness(this.#pageCount, this.#config);
    const stacks = getStackThicknesses(progress, total, this.#config.minimumStackThickness);
    this.#setStack(this.#leftStack, stacks.left, -1);
    this.#setStack(this.#rightStack, stacks.right, 1);
    this.#turnPreparationPage = null;
    this.#setStaticPageSurfacePositions();
  }

  setTurnDeformation(
    progress: number,
    direction: TurnDirection,
    pointerV = 0.82,
    verticalDrag = 0,
  ): void {
    const phase = Math.sin(Math.PI * Math.min(1, Math.max(0, progress)));
    if (phase < 0.0001 && this.#turnGutterPhase < 0.0001) return;
    this.#turnGutterPhase = phase;
    const source = direction === 'forward' ? 'right' : 'left';
    this.#deformGutter(this.#leftPage.geometry, this.#leftPageBasePositions, 'left', source, phase);
    this.#deformGutter(
      this.#rightPage.geometry,
      this.#rightPageBasePositions,
      'right',
      source,
      phase,
    );
    this.#deformGutter(
      this.#leftGutterShadow.geometry,
      this.#leftGutterShadowBasePositions,
      'left',
      source,
      phase,
    );
    this.#deformGutter(
      this.#rightGutterShadow.geometry,
      this.#rightGutterShadowBasePositions,
      'right',
      source,
      phase,
    );
    this.#leftGutterShadow.material.opacity =
      source === 'left' ? 0.4 + phase * 0.22 : 0.4 - phase * 0.08;
    this.#rightGutterShadow.material.opacity =
      source === 'right' ? 0.4 + phase * 0.22 : 0.4 - phase * 0.08;
    this.#updateEdgeContactShadow(progress, direction, pointerV, verticalDrag);
  }

  resetTurnDeformation(): void {
    if (this.#turnGutterPhase < 0.0001) return;
    this.#deformGutter(this.#leftPage.geometry, this.#leftPageBasePositions, 'left', 'right', 0);
    this.#deformGutter(this.#rightPage.geometry, this.#rightPageBasePositions, 'right', 'right', 0);
    this.#deformGutter(
      this.#leftGutterShadow.geometry,
      this.#leftGutterShadowBasePositions,
      'left',
      'right',
      0,
    );
    this.#deformGutter(
      this.#rightGutterShadow.geometry,
      this.#rightGutterShadowBasePositions,
      'right',
      'right',
      0,
    );
    this.#leftGutterShadow.material.opacity = 0.4;
    this.#rightGutterShadow.material.opacity = 0.4;
    this.#edgeContactShadow.visible = false;
    this.#edgeContactShadow.material.opacity = 0;
    this.#turnGutterPhase = 0;
  }

  #deformGutter(
    geometry: PlaneGeometry,
    basePositions: Float32Array,
    side: PageSide,
    source: PageSide,
    phase: number,
  ): void {
    const positions = geometry.attributes.position;
    const array = positions.array as Float32Array;
    const sourceWeight = side === source ? 1 : 0.55;
    const lean = source === 'right' ? 1 : -1;
    for (let offset = 0; offset < basePositions.length; offset += 3) {
      const x = basePositions[offset];
      const y = basePositions[offset + 1];
      const distance = Math.abs(x);
      const falloff = 1 - smoothstep(0, this.#pageWidth * 0.2, distance);
      const edge = 0.65 + 0.35 * getGutterEdgeInfluence(y, this.#pageHeight);
      const response = phase * falloff * falloff * edge * sourceWeight;
      array[offset] = x + lean * 0.003 * response * smoothstep(0, 0.012, distance);
      array[offset + 1] = y;
      array[offset + 2] = basePositions[offset + 2] - 0.0028 * response;
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  #updateEdgeContactShadow(
    progress: number,
    direction: TurnDirection,
    pointerV: number,
    verticalDrag: number,
  ): void {
    const pointAt = (y: number) =>
      computePageCurlPoint({
        x: this.#pageWidth,
        y,
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
    const center = pointAt(0);
    const lift = center.z / this.#pageWidth;
    const endpoint = Math.min(progress, 1 - progress);
    const opacity = 0.24 * (1 - smoothstep(0.025, 0.17, lift)) * smoothstep(0, 0.045, endpoint);
    this.#edgeContactShadow.visible = opacity > 0.002;
    if (!this.#edgeContactShadow.visible) return;
    this.#edgeContactShadow.material.opacity = opacity;
    const positions = this.#edgeContactShadow.geometry.attributes.position;
    const array = positions.array as Float32Array;
    for (let offset = 0; offset < array.length; offset += 3) {
      const baseX = this.#edgeContactShadowBasePositions[offset];
      const point = pointAt(this.#edgeContactShadowBasePositions[offset + 1]);
      const shadowX = point.x + (point.z * 1.8) / 6.8;
      const shadowY = point.y + (point.z * 1.6) / 6.8;
      const width = this.#pageWidth * (0.04 + lift * 0.12);
      array[offset] = shadowX + (baseX / (this.#pageWidth * 0.08)) * width;
      array[offset + 1] = shadowY;
      array[offset + 2] =
        STATIC_PAGE_SURFACE_Z +
        getGutterOffset(
          Math.abs(shadowX),
          this.#config,
          getGutterEdgeInfluence(shadowY, this.#pageHeight),
        ) +
        0.00055;
    }
    positions.needsUpdate = true;
    this.#edgeContactShadow.geometry.computeVertexNormals();
  }

  #setStaticPageSurfacePositions(): void {
    const readyLift = this.#config.paperThickness + TURNING_PAGE_CLEARANCE;
    this.#leftPage.position.z =
      STATIC_PAGE_SURFACE_Z + (this.#turnPreparationPage === 'left' ? readyLift : 0);
    this.#rightPage.position.z =
      STATIC_PAGE_SURFACE_Z + (this.#turnPreparationPage === 'right' ? readyLift : 0);
  }

  #setStack(stack: Mesh<BoxGeometry>, thickness: number, side: -1 | 1): void {
    stack.scale.z = Math.max(0.001, thickness);
    stack.position.z = -thickness / 2;
    stack.position.x = (side * this.#pageWidth) / 2;
  }

  setOpenProgress(progress: number): void {
    this.resetTurnDeformation();
    const coverProgress = phaseProgress(progress, 0, 0.78);
    const pageProgress = phaseProgress(progress, 0.12, 1);
    const centeringProgress = phaseProgress(progress, 0.06, 0.92);
    this.root.position.x = (-this.#pageWidth / 2) * (1 - centeringProgress);
    this.#frontCoverPivot.position.z =
      (-this.#totalThickness + FRONT_COVER_CLEARANCE) * coverProgress +
      Math.sin(Math.PI * coverProgress) * 0.045;
    this.#frontCoverPivot.rotation.y = Math.PI * coverProgress;
    this.leftHalf.position.z = Math.sin(Math.PI * pageProgress) * 0.018;
    this.leftHalf.rotation.y = Math.PI * (1 - pageProgress);
    this.#setOpeningLeaves(progress);
    this.#setPageEdgesVisible(pageProgress);
    this.#spine.visible = pageProgress < 0.9;
  }

  setBackOpenProgress(progress: number): void {
    this.resetTurnDeformation();
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

  beginBoundaryTurn(edge: 'front' | 'back', initialOpenProgress: 0 | 1): void {
    this.resetTurnDeformation();
    this.#frontCoverPivot.visible = edge !== 'front';
    this.#backCoverPivot.visible = edge !== 'back';
    this.leftHalf.rotation.y = 0;
    this.leftHalf.position.z = 0;
    this.rightHalf.rotation.y = 0;
    this.rightHalf.position.z = 0;
    this.leftHalf.visible = edge === 'back';
    this.rightHalf.visible = edge === 'front';
    for (const leaf of this.#openingLeaves) leaf.visible = false;
    for (const leaf of this.#backOpeningLeaves) leaf.visible = false;
    this.#setPageEdgesVisible(1);
    this.#spine.visible = false;
    this.setBoundaryOpenProgress(initialOpenProgress, edge);
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

  setCornerLift(target: BookCornerTarget, corner: BookCorner): void {
    if (this.#cornerLift?.target === target && this.#cornerLift.corner === corner) return;
    this.clearCornerLift();
    this.#cornerLift = { target, corner };
    if (target === 'left') {
      liftGeometryCorner(this.#leftPage.geometry, this.#leftPageBasePositions, -1, corner, 0.032);
    } else if (target === 'right') {
      liftGeometryCorner(this.#rightPage.geometry, this.#rightPageBasePositions, 1, corner, 0.032);
    } else if (target === 'front-cover') {
      liftGeometryCorner(
        this.#frontCover.geometry,
        this.#frontCoverBasePositions,
        1,
        corner,
        0.014,
      );
    } else {
      liftGeometryCorner(this.#backCover.geometry, this.#backCoverBasePositions, 1, corner, -0.014);
    }
  }

  clearCornerLift(): void {
    if (!this.#cornerLift) return;
    const target = this.#cornerLift.target;
    if (target === 'left') restoreGeometry(this.#leftPage.geometry, this.#leftPageBasePositions);
    else if (target === 'right') {
      restoreGeometry(this.#rightPage.geometry, this.#rightPageBasePositions);
    } else if (target === 'front-cover') {
      restoreGeometry(this.#frontCover.geometry, this.#frontCoverBasePositions);
    } else restoreGeometry(this.#backCover.geometry, this.#backCoverBasePositions);
    this.#cornerLift = null;
  }

  pruneSurfaces(): void {
    this.#pruneSurfaces();
  }

  prewarmSurfaces(canvases: readonly HTMLCanvasElement[]): CanvasTexture[] {
    return canvases.map((canvas) => this.#surfaceCache.warm(canvas));
  }

  refreshSurfaceTextures(): void {
    this.#surfaceCache.refresh();
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
  const geometry = new BoxGeometry(width, height, depth, 32, 20, 1);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const distanceFromSpine = Math.max(0, x + width / 2);
    const bend = getFrontCoverSpineBend(distanceFromSpine, width, depth);
    positions.setZ(index, positions.getZ(index) + bend);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function liftGeometryCorner(
  geometry: BoxGeometry | PlaneGeometry,
  basePositions: Float32Array,
  outerDirection: -1 | 1,
  corner: BookCorner,
  lift: number,
): void {
  const positions = geometry.attributes.position;
  const positionArray = positions.array as Float32Array;
  let maximumX = 0;
  let maximumY = 0;
  for (let offset = 0; offset < basePositions.length; offset += 3) {
    maximumX = Math.max(maximumX, Math.abs(basePositions[offset]));
    maximumY = Math.max(maximumY, Math.abs(basePositions[offset + 1]));
  }
  for (let offset = 0; offset < basePositions.length; offset += 3) {
    const x = basePositions[offset];
    const y = basePositions[offset + 1];
    const outer = smoothstep(0.42, 1, (x * outerDirection) / Math.max(maximumX, 0.001));
    const vertical = smoothstep(
      0.34,
      1,
      (y * (corner === 'top' ? 1 : -1)) / Math.max(maximumY, 0.001),
    );
    const influence = outer * outer * vertical * vertical;
    positionArray[offset] = x;
    positionArray[offset + 1] = y;
    positionArray[offset + 2] = basePositions[offset + 2] + lift * influence;
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}

function restoreGeometry(geometry: BoxGeometry | PlaneGeometry, basePositions: Float32Array): void {
  (geometry.attributes.position.array as Float32Array).set(basePositions);
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const unit = Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
  return unit * unit * (3 - 2 * unit);
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

function createGutterShadowGeometry(options: BookModelOptions, side: PageSide): PlaneGeometry {
  const geometry = new PlaneGeometry(
    options.pageWidth * 0.045,
    options.pageHeight * 0.982,
    4,
    options.config.heightSegments,
  );
  geometry.translate((side === 'left' ? -1 : 1) * options.pageWidth * 0.0225, 0, 0);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    positions.setZ(
      index,
      STATIC_PAGE_SURFACE_Z +
        getGutterOffset(
          Math.abs(x),
          options.config,
          getGutterEdgeInfluence(y, options.pageHeight),
        ) +
        0.00035,
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function setMaterialMap(material: MeshStandardMaterial, map: CanvasTexture | null): void {
  if (material.map === map) return;
  material.map = map;
  material.needsUpdate = true;
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

function createGutterShadowCanvas(side: PageSide): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 8;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  const stops = [
    [0, 0],
    [0.35, 0.025],
    [0.72, 0.08],
    [1, 0.18],
  ] as const;
  for (const [position, opacity] of side === 'left' ? stops : [...stops].reverse()) {
    gradient.addColorStop(
      side === 'left' ? position : 1 - position,
      `rgba(48, 29, 20, ${opacity})`,
    );
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function createEdgeContactShadowCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, 'rgba(38, 31, 25, 0)');
  gradient.addColorStop(0.3, 'rgba(38, 31, 25, 0.18)');
  gradient.addColorStop(0.5, 'rgba(38, 31, 25, 0.4)');
  gradient.addColorStop(0.7, 'rgba(38, 31, 25, 0.18)');
  gradient.addColorStop(1, 'rgba(38, 31, 25, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
