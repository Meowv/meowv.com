export interface PaginatedSection {
  startPage: number;
  pageCount: number;
}

/** 分页段按 startPage 递增排列，返回命中下标；无效页码返回 -1。 */
export function findSectionIndex(
  pagination: readonly PaginatedSection[],
  pageNumber: number,
): number {
  let low = 0;
  let high = pagination.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const section = pagination[middle];
    if (!section) return -1;
    if (pageNumber < section.startPage) {
      high = middle - 1;
    } else if (pageNumber >= section.startPage + section.pageCount) {
      low = middle + 1;
    } else {
      return middle;
    }
  }

  return -1;
}
