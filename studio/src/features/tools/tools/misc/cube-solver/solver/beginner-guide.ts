import { isSolved } from '../core/cube';
import type { CubePosition } from '../types';

interface PhaseDefinition {
  id: string;
  title: string;
  goal: string;
  grip: string;
  reached(position: CubePosition): boolean;
}

const indexesSolved = (values: readonly number[], indexes: readonly number[]): boolean =>
  indexes.every((index) => values[index] === index);

const orientationsSolved = (values: readonly number[], indexes: readonly number[]): boolean =>
  indexes.every((index) => values[index] === 0);

const topCross = (position: CubePosition): boolean =>
  indexesSolved(position.edges.permutation, [0, 1, 2, 3]) &&
  orientationsSolved(position.edges.orientation, [0, 1, 2, 3]);

const topLayer = (position: CubePosition): boolean =>
  topCross(position) &&
  indexesSolved(position.corners.permutation, [0, 1, 2, 3]) &&
  orientationsSolved(position.corners.orientation, [0, 1, 2, 3]);

const middleLayer = (position: CubePosition): boolean =>
  topLayer(position) &&
  indexesSolved(position.edges.permutation, [8, 9, 10, 11]) &&
  orientationsSolved(position.edges.orientation, [8, 9, 10, 11]);

const bottomCrossOriented = (position: CubePosition): boolean =>
  middleLayer(position) &&
  [4, 5, 6, 7].every(
    (index) => position.edges.permutation[index]! >= 4 && position.edges.permutation[index]! <= 7,
  ) &&
  orientationsSolved(position.edges.orientation, [4, 5, 6, 7]);

const bottomFaceOriented = (position: CubePosition): boolean =>
  bottomCrossOriented(position) &&
  [4, 5, 6, 7].every(
    (index) =>
      position.corners.permutation[index]! >= 4 &&
      position.corners.permutation[index]! <= 7 &&
      position.corners.orientation[index] === 0,
  );

const bottomCornersPlaced = (position: CubePosition): boolean =>
  bottomFaceOriented(position) && indexesSolved(position.corners.permutation, [4, 5, 6, 7]);

const DEFINITIONS: PhaseDefinition[] = [
  {
    id: 'white-cross',
    title: '白色十字',
    goal: '让四条白色棱块与相邻中心色对齐。',
    grip: '保持白色中心朝上、绿色中心朝前。',
    reached: topCross,
  },
  {
    id: 'white-corners',
    title: '白色底层角块',
    goal: '完成白色一层，并让侧面颜色连续。',
    grip: '继续保持白色面方向不变。',
    reached: topLayer,
  },
  {
    id: 'middle-edges',
    title: '中间层棱块',
    goal: '将四条不含黄色的棱块放入中层。',
    grip: '白色面保持固定，优先观察前、右两面。',
    reached: middleLayer,
  },
  {
    id: 'yellow-cross',
    title: '黄色十字',
    goal: '让黄色面的四条棱块朝向正确。',
    grip: '将黄色中心朝向自己更容易观察。',
    reached: bottomCrossOriented,
  },
  {
    id: 'yellow-face',
    title: '黄色顶面',
    goal: '让四个黄色角块朝向黄色面。',
    grip: '黄色面保持朝向自己，按提示完成每一步。',
    reached: bottomFaceOriented,
  },
  {
    id: 'yellow-corners',
    title: '黄色角块定位',
    goal: '让四个黄色角块回到正确位置。',
    grip: '找到已经匹配的角块并保持在提示位置。',
    reached: bottomCornersPlaced,
  },
  {
    id: 'yellow-edges',
    title: '黄色棱块定位',
    goal: '调整最后四条棱块，完成整个魔方。',
    grip: '保持已完成面不变，直到所有侧面颜色对齐。',
    reached: isSolved,
  },
];

export function beginnerPhaseDefinitions(): ReadonlyArray<Omit<PhaseDefinition, 'reached'>> {
  return DEFINITIONS.map(({ id, title, goal, grip }) => ({ id, title, goal, grip }));
}

export function beginnerPhaseReached(id: string, position: CubePosition): boolean {
  return DEFINITIONS.find((definition) => definition.id === id)?.reached(position) ?? false;
}
