export interface BookSpread {
  index: number;
  leftPage: number | null;
  rightPage: number | null;
}

function normalizePageCount(pageCount: number): number {
  if (!Number.isInteger(pageCount) || pageCount < 0) {
    throw new RangeError('pageCount 必须是非负整数。');
  }
  return pageCount;
}

export function getSpreadCount(pageCount: number): number {
  const count = normalizePageCount(pageCount);
  return count === 0 ? 0 : Math.ceil((count + 1) / 2);
}

export function getLastSpreadIndex(pageCount: number): number {
  return Math.max(0, getSpreadCount(pageCount) - 1);
}

export function clampSpreadIndex(spreadIndex: number, pageCount: number): number {
  if (!Number.isFinite(spreadIndex)) {
    return 0;
  }

  return Math.min(getLastSpreadIndex(pageCount), Math.max(0, Math.trunc(spreadIndex)));
}

/**
 * 封面后的第一页独占右页，之后依次为 2/3、4/5……；末页不足时另一侧保持空白。
 */
export function getSpread(spreadIndex: number, pageCount: number): BookSpread {
  const count = normalizePageCount(pageCount);
  const index = clampSpreadIndex(spreadIndex, count);

  if (count === 0) {
    return { index: 0, leftPage: null, rightPage: null };
  }
  if (index === 0) {
    return { index, leftPage: null, rightPage: 1 };
  }

  const leftPage = index * 2;
  const rightPage = leftPage + 1;
  return {
    index,
    leftPage: leftPage <= count ? leftPage : null,
    rightPage: rightPage <= count ? rightPage : null,
  };
}

export function getSpreadIndexForPage(pageNumber: number, pageCount: number): number {
  const count = normalizePageCount(pageCount);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > count) {
    throw new RangeError(`pageNumber 必须在 1 到 ${count} 之间。`);
  }

  return pageNumber === 1 ? 0 : Math.floor(pageNumber / 2);
}

export function canTurnForward(spreadIndex: number, pageCount: number): boolean {
  return clampSpreadIndex(spreadIndex, pageCount) < getLastSpreadIndex(pageCount);
}

export function canTurnBackward(spreadIndex: number, pageCount: number): boolean {
  return clampSpreadIndex(spreadIndex, pageCount) > 0;
}

export function getAdjacentSpreadIndex(
  spreadIndex: number,
  pageCount: number,
  direction: 'forward' | 'backward',
): number | null {
  const current = clampSpreadIndex(spreadIndex, pageCount);
  if (direction === 'forward') {
    return canTurnForward(current, pageCount) ? current + 1 : null;
  }
  return canTurnBackward(current, pageCount) ? current - 1 : null;
}
