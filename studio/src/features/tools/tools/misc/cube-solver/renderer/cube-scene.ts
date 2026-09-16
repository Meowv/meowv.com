import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FACES, type CubeColorScheme, type CubeMove, type Face, type Facelet } from '../types';
import { CUBIE_COORDINATES, faceletIndex, facesForPosition, layerForFace } from './geometry';

interface CubeSceneOptions {
  colorScheme: CubeColorScheme;
}

const BODY_COLOR = 0x17191f;
const EMPTY_STICKER_COLOR = '#6f7785';
const STICKER_GAP = 0.495;
const DEFAULT_CAMERA_POSITION = { x: 5.7, y: 5.2, z: 6.6 };
type StickerMaterialKey = Face | 'empty';

function positionSticker(mesh: Mesh, face: Face): void {
  switch (face) {
    case 'U':
      mesh.position.y = STICKER_GAP;
      mesh.rotation.x = -Math.PI / 2;
      break;
    case 'D':
      mesh.position.y = -STICKER_GAP;
      mesh.rotation.x = Math.PI / 2;
      break;
    case 'F':
      mesh.position.z = STICKER_GAP;
      break;
    case 'B':
      mesh.position.z = -STICKER_GAP;
      mesh.rotation.y = Math.PI;
      break;
    case 'R':
      mesh.position.x = STICKER_GAP;
      mesh.rotation.y = Math.PI / 2;
      break;
    case 'L':
      mesh.position.x = -STICKER_GAP;
      mesh.rotation.y = -Math.PI / 2;
      break;
  }
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

export class CubeScene {
  readonly #host: HTMLElement;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(32, 1, 0.1, 100);
  readonly #renderer: WebGLRenderer;
  readonly #controls: OrbitControls;
  readonly #resizeObserver: ResizeObserver;
  readonly #root = new Group();
  readonly #options: CubeSceneOptions;
  readonly #bodyGeometry = new BoxGeometry(0.92, 0.92, 0.92);
  readonly #stickerGeometry = new PlaneGeometry(0.76, 0.76);
  readonly #bodyMaterial = new MeshStandardMaterial({
    color: BODY_COLOR,
    roughness: 0.42,
    metalness: 0.05,
  });
  readonly #stickerMaterials = new Map<StickerMaterialKey, MeshStandardMaterial>();
  #facelets: readonly Facelet[] = [];
  readonly #cubies: Group[] = [];
  readonly #stickers: Mesh[] = [];
  #animationFrame = 0;
  #resizeFrame = 0;
  #renderFrames = 0;
  #renderWidth = 0;
  #renderHeight = 0;
  #animationReject: ((reason: Error) => void) | null = null;
  #animationPivot: Group | null = null;
  #disposed = false;

  constructor(host: HTMLElement, options: CubeSceneOptions) {
    this.#host = host;
    this.#options = options;
    this.#renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const pixelRatioLimit = globalThis.innerWidth <= 760 ? 1.25 : 1.75;
    this.#renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, pixelRatioLimit));
    this.#renderer.setClearColor(0x000000, 0);
    this.#renderer.domElement.className = 'cube-viewport__canvas';
    this.#renderer.domElement.setAttribute('aria-label', '可拖动观察的三阶魔方');
    host.append(this.#renderer.domElement);

    this.#scene.add(this.#root);
    this.#scene.add(new AmbientLight(0xffffff, 1.55));
    const light = new DirectionalLight(0xffffff, 2.2);
    light.position.set(5, 8, 7);
    this.#scene.add(light);
    const fill = new DirectionalLight(0x9fb7ff, 0.75);
    fill.position.set(-6, 2, -5);
    this.#scene.add(fill);

    for (const face of FACES) {
      this.#stickerMaterials.set(
        face,
        new MeshStandardMaterial({
          color: options.colorScheme[face],
          roughness: 0.5,
          metalness: 0,
        }),
      );
    }
    this.#stickerMaterials.set(
      'empty',
      new MeshStandardMaterial({ color: EMPTY_STICKER_COLOR, roughness: 0.5, metalness: 0 }),
    );
    this.#buildCubies();

    this.#camera.position.set(
      DEFAULT_CAMERA_POSITION.x,
      DEFAULT_CAMERA_POSITION.y,
      DEFAULT_CAMERA_POSITION.z,
    );
    this.#camera.lookAt(0, 0, 0);
    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = true;
    this.#controls.enablePan = false;
    this.#controls.minDistance = 5;
    this.#controls.maxDistance = 14;
    this.#controls.addEventListener('change', () => this.invalidate(2));

    this.#resizeObserver = new ResizeObserver(() => this.#scheduleResize());
    this.#resizeObserver.observe(host);
    this.resize();
  }

  setFacelets(facelets: readonly Facelet[]): void {
    if (facelets.length !== 54) return;
    if (
      this.#facelets.length === 54 &&
      this.#facelets.every((facelet, index) => facelet === facelets[index])
    ) {
      return;
    }
    this.#facelets = [...facelets];
    if (!this.#animationReject) this.#syncCubies();
  }

  setColorScheme(colorScheme: CubeColorScheme): void {
    this.#options.colorScheme = { ...colorScheme };
    for (const face of FACES) this.#stickerMaterials.get(face)?.color.set(colorScheme[face]);
    this.invalidate(2);
  }

  resetCamera(): void {
    this.#camera.position.set(
      DEFAULT_CAMERA_POSITION.x,
      DEFAULT_CAMERA_POSITION.y,
      DEFAULT_CAMERA_POSITION.z,
    );
    this.#controls.target.set(0, 0, 0);
    this.#controls.update();
    this.invalidate(2);
  }

  cancelAnimation(): void {
    this.#cancelAnimation(new Error('转动已取消。'));
  }

  async animateMove(
    move: CubeMove,
    nextFacelets: readonly Facelet[],
    duration: number,
  ): Promise<void> {
    if (this.#disposed) return;
    this.#cancelAnimation(new Error('转动已被新的操作替换。'));
    cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = 0;
    this.#renderFrames = 0;
    const selected = layerForFace(move.face);
    const pivot = new Group();
    this.#animationPivot = pivot;
    this.#scene.add(pivot);
    for (const cubie of this.#cubies) {
      if (Number(cubie.userData[selected.axis]) === selected.coordinate) pivot.attach(cubie);
    }
    const target = selected.sign * (move.amount === 2 ? Math.PI : move.amount * (Math.PI / 2));
    const reducedMotion =
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const actualDuration = reducedMotion ? 0 : Math.max(70, duration);

    await new Promise<void>((resolve, reject) => {
      this.#animationReject = reject;
      const startedAt = performance.now();
      const tick = (time: number): void => {
        if (!this.#animationReject) return;
        const progress =
          actualDuration === 0 ? 1 : Math.min(1, (time - startedAt) / actualDuration);
        pivot.rotation[selected.axis] = target * easeInOutCubic(progress);
        this.#renderer.render(this.#scene, this.#camera);
        if (progress < 1) {
          this.#animationFrame = requestAnimationFrame(tick);
          return;
        }
        this.#animationFrame = 0;
        this.#animationReject = null;
        this.#releaseAnimationPivot();
        this.#facelets = [...nextFacelets];
        this.#syncCubies();
        resolve();
      };
      this.#animationFrame = requestAnimationFrame(tick);
    });
  }

  #cancelAnimation(reason: Error): void {
    if (!this.#animationReject) return;
    cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = 0;
    const reject = this.#animationReject;
    this.#animationReject = null;
    this.#releaseAnimationPivot();
    reject(reason);
    if (!this.#disposed) this.#syncCubies();
  }

  #releaseAnimationPivot(): void {
    const pivot = this.#animationPivot;
    if (!pivot) return;
    for (const cubie of [...pivot.children]) this.#root.attach(cubie);
    this.#scene.remove(pivot);
    this.#animationPivot = null;
  }

  #buildCubies(): void {
    for (const { x, y, z } of CUBIE_COORDINATES) {
      const cubie = new Group();
      cubie.position.set(x, y, z);
      cubie.userData.x = x;
      cubie.userData.y = y;
      cubie.userData.z = z;
      cubie.add(new Mesh(this.#bodyGeometry, this.#bodyMaterial));
      for (const face of facesForPosition({ x, y, z })) {
        const absoluteIndex = faceletIndex(face, x, y, z);
        const sticker = new Mesh(this.#stickerGeometry, this.#stickerMaterials.get('empty')!);
        sticker.userData.absoluteIndex = absoluteIndex;
        positionSticker(sticker, face);
        cubie.add(sticker);
        this.#stickers.push(sticker);
      }
      this.#root.add(cubie);
      this.#cubies.push(cubie);
    }
  }

  #syncCubies(): void {
    for (const cubie of this.#cubies) {
      if (cubie.parent !== this.#root) this.#root.attach(cubie);
      cubie.position.set(
        Number(cubie.userData.x),
        Number(cubie.userData.y),
        Number(cubie.userData.z),
      );
      cubie.rotation.set(0, 0, 0);
      cubie.scale.set(1, 1, 1);
      cubie.updateMatrix();
    }
    for (const sticker of this.#stickers) {
      const colorId = this.#facelets[Number(sticker.userData.absoluteIndex)];
      sticker.material = this.#stickerMaterials.get(colorId ?? 'empty')!;
    }
    this.invalidate(2);
  }

  resize(): void {
    const width = this.#host.clientWidth;
    const height = this.#host.clientHeight;
    if (
      width < 32 ||
      height < 32 ||
      (width === this.#renderWidth && height === this.#renderHeight)
    ) {
      return;
    }
    this.#renderWidth = width;
    this.#renderHeight = height;
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height, false);
    this.invalidate(2);
  }

  #scheduleResize(): void {
    if (this.#resizeFrame || this.#disposed) return;
    this.#resizeFrame = requestAnimationFrame(() => {
      this.#resizeFrame = 0;
      this.resize();
    });
  }

  invalidate(frames = 1): void {
    this.#renderFrames = Math.max(this.#renderFrames, frames);
    if (this.#animationFrame || this.#animationReject) return;
    const render = (): void => {
      if (this.#disposed || this.#renderFrames <= 0) {
        this.#animationFrame = 0;
        return;
      }
      this.#renderFrames -= 1;
      this.#controls.update();
      this.#renderer.render(this.#scene, this.#camera);
      this.#animationFrame = this.#renderFrames > 0 ? requestAnimationFrame(render) : 0;
    };
    this.#animationFrame = requestAnimationFrame(render);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#cancelAnimation(new Error('3D 场景已关闭。'));
    this.#disposed = true;
    cancelAnimationFrame(this.#animationFrame);
    cancelAnimationFrame(this.#resizeFrame);
    this.#resizeObserver.disconnect();
    this.#controls.dispose();
    this.#bodyGeometry.dispose();
    this.#stickerGeometry.dispose();
    this.#bodyMaterial.dispose();
    this.#stickerMaterials.forEach((material) => material.dispose());
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
    this.#renderer.domElement.remove();
  }
}
