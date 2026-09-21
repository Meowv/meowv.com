import { describe, expect, it } from 'vitest';
import { findSectionIndex, type PaginatedSection } from './page-lookup';

const pagination: PaginatedSection[] = [
  { startPage: 1, pageCount: 2 },
  { startPage: 3, pageCount: 5 },
  { startPage: 8, pageCount: 1 },
  { startPage: 9, pageCount: 12 },
];

describe('findSectionIndex', () => {
  it('returns the matching section at boundaries', () => {
    expect(findSectionIndex(pagination, 1)).toBe(0);
    expect(findSectionIndex(pagination, 2)).toBe(0);
    expect(findSectionIndex(pagination, 3)).toBe(1);
    expect(findSectionIndex(pagination, 7)).toBe(1);
    expect(findSectionIndex(pagination, 8)).toBe(2);
    expect(findSectionIndex(pagination, 9)).toBe(3);
    expect(findSectionIndex(pagination, 20)).toBe(3);
  });

  it('returns -1 outside the indexed range', () => {
    expect(findSectionIndex(pagination, 0)).toBe(-1);
    expect(findSectionIndex(pagination, 21)).toBe(-1);
    expect(findSectionIndex([], 1)).toBe(-1);
  });
});
