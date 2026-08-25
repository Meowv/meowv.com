import type { Face, ScannedSticker } from '../types';

// 每次都从该面的外侧观察，并按引导保持 U/F 参考方向，因此相机九宫格可直接映射到规范面索引。
// 显式保留六面映射，后续调整握持引导时不会把方向约定散落到组件中。
export const CAMERA_FACELET_MAP: Record<Face, readonly number[]> = {
  F: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  R: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  B: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  L: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  U: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  D: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

export function mapCameraSamples(
  face: Face,
  colors: ReadonlyArray<readonly [number, number, number]>,
): ScannedSticker[] {
  if (colors.length !== 9) throw new Error('每个魔方面必须包含九个颜色样本。');
  return colors.map((rgb, cameraIndex) => ({
    face,
    index: CAMERA_FACELET_MAP[face][cameraIndex]!,
    rgb: [...rgb],
  }));
}
