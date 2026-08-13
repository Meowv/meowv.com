import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { easeInOutCubic, getGutterEdgeInfluence, getGutterOffset } from '../turn/PageCurl';
import { getStackThicknesses, getTotalPaperThickness, type BookConfig } from '../BookConfig';
import { createPageTexture, disposeObject } from '../three-utils';
import { TurningSheet } from './TurningSheet';

interface BookModelOptions {
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  config: Readonly<BookConfig>;
  maxAnisotropy: number;
}

type PageSide = 'left' | 'right';

export class BookModel {
  readonly root = new Group();
  readonly leftHalf = new Group();
  readonly rightHalf = new Group();
  readonly turningSheet: TurningSheet;
  readonly #frontCoverPivot = new Group();
  readonly #leftPage: Mesh<PlaneGeometry>;
  readonly #rightPage: Mesh<PlaneGeometry>;
  readonly #leftPageMaterial: MeshStandardMaterial;
  readonly #rightPageMaterial: MeshStandardMaterial;
  readonly #frontCoverMaterial: MeshStandardMaterial;
  readonly #leftStack: Mesh<BoxGeometry>;
  readonly #rightStack: Mesh<BoxGeometry>;
  readonly #leftPageEdges = new Group();
  readonly #rightPageEdges = new Group();
  readonly #spine: Mesh<BoxGeometry>;
  readonly #pageWidth: number;
  readonly #pageCount: number;
  readonly #totalThickness: number;
  readonly #config: Readonly<BookConfig>;
  readonly #maxAnisotropy: number;
  #leftTexture: CanvasTexture | null = null;
  #rightTexture: CanvasTexture | null = null;
  #coverTexture: CanvasTexture | null = null;

  constructor(options: BookModelOptions) {
    this.#pageWidth = options.pageWidth;
    this.#pageCount = options.pageCount;
    this.#config = options.config;
    this.#maxAnisotropy = options.maxAnisotropy;

    const totalThickness = getTotalPaperThickness(options.pageCount, options.config);
    this.#totalThickness = totalThickness;
    const pageMaterial = () =>
      new MeshStandardMaterial({
        color: 0xfffdf7,
        metalness: 0,
        roughness: 0.91,
      });
    this.#leftPageMaterial = pageMaterial();
    this.#rightPageMaterial = pageMaterial();
    this.#leftPage = createStaticPage('left', options, this.#leftPageMaterial);
    this.#rightPage = createStaticPage('right', options, this.#rightPageMaterial);

    const stackMaterial = new MeshStandardMaterial({
      color: 0xe8dfd1,
      metalness: 0,
      roughness: 0.98,
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
    backCover.position.z = -totalThickness - options.config.coverThickness / 2;
    backCover.castShadow = true;
    backCover.receiveShadow = true;

    this.#frontCoverMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.72,
    });
    const frontCover = new Mesh(
      new BoxGeometry(coverWidth, coverHeight, options.config.coverThickness),
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

    this.#spine = new Mesh(
      new BoxGeometry(options.config.coverThickness * 0.9, coverHeight, totalThickness * 1.6),
      new MeshStandardMaterial({ color: 0x422219, metalness: 0, roughness: 0.78 }),
    );
    this.#spine.position.z = -totalThickness * 0.8;
    this.#spine.castShadow = true;

    this.leftHalf.add(this.#leftStack, this.#leftPage, this.#leftPageEdges);
    this.rightHalf.add(this.#rightStack, this.#rightPage, this.#rightPageEdges);
    this.root.add(backCover, this.leftHalf, this.rightHalf, this.#frontCoverPivot, this.#spine);
    addVisiblePageEdges(this.#leftPageEdges, this.#rightPageEdges, options, totalThickness);

    this.turningSheet = new TurningSheet({
      pageWidth: options.pageWidth,
      pageHeight: options.pageHeight,
      config: options.config,
    });
    this.turningSheet.mesh.position.z = 0.004;
    this.root.add(this.turningSheet.mesh);
    this.setProgress(0);
    this.setOpenProgress(0);
  }

  setCover(canvas: HTMLCanvasElement): void {
    this.#coverTexture?.dispose();
    this.#coverTexture = createPageTexture(canvas, this.#maxAnisotropy);
    this.#frontCoverMaterial.map = this.#coverTexture;
  }

  setStaticPages(left: HTMLCanvasElement | null, right: HTMLCanvasElement | null): void {
    this.#leftTexture?.dispose();
    this.#rightTexture?.dispose();
    this.#leftTexture = left ? createPageTexture(left, this.#maxAnisotropy) : null;
    this.#rightTexture = right ? createPageTexture(right, this.#maxAnisotropy) : null;
    this.#leftPageMaterial.map = this.#leftTexture;
    this.#rightPageMaterial.map = this.#rightTexture;
    this.#leftPage.visible = Boolean(left);
    this.#rightPage.visible = Boolean(right);
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
    const eased = easeInOutCubic(progress);
    this.root.position.x = (-this.#pageWidth / 2) * (1 - eased);
    this.#frontCoverPivot.position.z = (-this.#totalThickness + 0.006) * eased;
    this.#frontCoverPivot.rotation.y = Math.PI * eased;
    this.leftHalf.rotation.y = Math.PI * (1 - eased);
    this.#setPageEdgesVisible(eased);
    this.#spine.visible = eased < 0.82;
  }

  setClosedFromOpenProgress(progress: number): void {
    const eased = easeInOutCubic(progress);
    this.root.position.x = (-this.#pageWidth / 2) * eased;
    this.#frontCoverPivot.position.z = (-this.#totalThickness + 0.006) * (1 - eased);
    this.leftHalf.rotation.y = Math.PI * eased;
    this.#frontCoverPivot.rotation.y = Math.PI * (1 - eased);
    this.#setPageEdgesVisible(1 - eased);
    this.#spine.visible = eased > 0.18;
  }

  #setPageEdgesVisible(openProgress: number): void {
    const visible = openProgress > 0.14;
    this.#leftPageEdges.visible = visible;
    this.#rightPageEdges.visible = visible;
  }

  dispose(): void {
    this.#leftTexture?.dispose();
    this.#rightTexture?.dispose();
    this.#coverTexture?.dispose();
    this.turningSheet.dispose();
    disposeObject(this.root);
  }
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
