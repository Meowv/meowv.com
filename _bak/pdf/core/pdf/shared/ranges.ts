import type { PageRangeGroup } from "../types";

export type RangeMode = "segments" | "groups";

export interface PageRangeParseResult {
  valid: boolean;
  groups: PageRangeGroup[];
  error: string;
}

function parseToken(token: string, pageCount: number): number[] {
  const rangeMatch = token.match(/^(\d+)(?:-(\d+))?$/);
  if (!rangeMatch) {
    throw new Error(`“${token}”不是有效页码`);
  }

  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2] ?? rangeMatch[1]);

  if (start < 1 || end < 1 || start > pageCount || end > pageCount) {
    throw new Error(`页码必须在 1 到 ${pageCount} 之间`);
  }

  if (start > end) {
    throw new Error(`起始页 ${start} 不能大于结束页 ${end}`);
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function parsePageRanges(
  input: string,
  pageCount: number,
  mode: RangeMode = "segments"
): PageRangeParseResult {
  const normalized = input.replace(/\s+/g, "");
  if (!normalized) {
    return { valid: false, groups: [], error: "请输入页码范围" };
  }

  try {
    if (mode === "groups") {
      const groups = normalized.split(";").map((group, index) => {
        if (!group) {
          throw new Error(`第 ${index + 1} 组为空`);
        }

        const pages = group
          .split(",")
          .flatMap((token) => parseToken(token, pageCount))
          .filter((page, position, all) => all.indexOf(page) === position);

        return {
          label: `group-${index + 1}`,
          pages
        };
      });

      return { valid: true, groups, error: "" };
    }

    const groups = normalized.split(",").map((token) => {
      const pages = parseToken(token, pageCount);
      return {
        label:
          pages.length === 1 ? `page-${pages[0]}` : `pages-${pages[0]}-${pages[pages.length - 1]}`,
        pages
      };
    });

    return { valid: true, groups, error: "" };
  } catch (error) {
    return {
      valid: false,
      groups: [],
      error: error instanceof Error ? error.message : "页码范围无效"
    };
  }
}

export function pagesByParity(pageCount: number, parity: "odd" | "even"): number[] {
  const remainder = parity === "odd" ? 1 : 0;
  return Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    (page) => page % 2 === remainder
  );
}

export function chunkPages(pageCount: number, chunkSize: number): PageRangeGroup[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    return [];
  }

  const groups: PageRangeGroup[] = [];
  for (let start = 1; start <= pageCount; start += chunkSize) {
    const end = Math.min(pageCount, start + chunkSize - 1);
    groups.push({
      label: start === end ? `page-${start}` : `pages-${start}-${end}`,
      pages: Array.from({ length: end - start + 1 }, (_, index) => start + index)
    });
  }

  return groups;
}
