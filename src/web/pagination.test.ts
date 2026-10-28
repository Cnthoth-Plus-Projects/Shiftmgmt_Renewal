import { describe, expect, it } from "vitest";
import { getPaginationItems, paginateGroupsForHeight } from "./pagination";

describe("shared table height pagination", () => {
  const rows = Array.from({ length: 55 }, (_, i) => ({ id: i, group: i < 13 ? "a" : "b" }));
  const key = (row: typeof rows[number]) => row.group;
  it("uses every complete row slot including exact fractional boundaries", () => {
    expect(paginateGroupsForHeight(rows, 486.824, 27, 27.823, () => "one")[0]).toEqual({ start: 0, end: 17 });
    expect(paginateGroupsForHeight(rows, 486.8, 27, 27.823, () => "one")[0]).toEqual({ start: 0, end: 16 });
    expect(paginateGroupsForHeight(rows, 700, 27, 28, key)[0].end).toBeGreaterThan(17);
  });
  it("keeps all ids once and leaves less than the next complete row plus group heading", () => {
    for (const height of [250, 350, 500, 700]) {
      const pages = paginateGroupsForHeight(rows, height, 27, 28, key);
      expect(pages.flatMap(p => rows.slice(p.start, p.end).map(r => r.id))).toEqual(rows.map(r => r.id));
      for (const p of pages) {
        const groupCount = rows.slice(p.start, p.end).filter((r, i, items) => i === 0 || r.group !== items[i - 1].group).length;
        const used = (p.end - p.start) * 27 + groupCount * 28;
        expect(used).toBeLessThanOrEqual(height);
        if (p.end < rows.length) expect(height - used).toBeLessThan(27 + (key(rows[p.end]) === key(rows[p.end - 1]) ? 0 : 28));
      }
    }
  });
  it("retains ten-row fallback for narrow/unmeasured views and handles empty data", () => {
    expect(paginateGroupsForHeight(rows, 0, 27, 28, key)[0]).toEqual({ start: 0, end: 10 });
    expect(paginateGroupsForHeight([], 300, 27, 28, key)).toEqual([{ start: 0, end: 0 }]);
  });
});

describe("shared pagination window", () => {
  it("has no numbered page for an empty collection", () => {
    expect(getPaginationItems(1, 0)).toEqual([]);
  });
  it("shows every number for small page counts", () => {
    for (let total = 1; total <= 9; total++) expect(getPaginationItems(1, total)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
  });
  it("keeps first and last pages and the current page in a bounded ordered window", () => {
    for (const total of [8, 9, 11, 101, 100_001]) {
      for (const current of [1, 2, 4, 5, Math.floor(total / 2), total - 4, total - 3, total - 1, total]) {
        const items = getPaginationItems(current, total);
        const numbers = items.filter((item): item is number => typeof item === "number");
        expect(items.length).toBeLessThanOrEqual(9);
        expect(numbers[0]).toBe(1);
        expect(numbers[1]).toBe(2);
        expect(numbers.at(-2)).toBe(total - 1);
        expect(numbers.at(-1)).toBe(total);
        expect(numbers).toContain(current);
        expect(numbers).toEqual([...new Set(numbers)].sort((a, b) => a - b));
        expect(numbers.every(n => n >= 1 && n <= total)).toBe(true);
      }
    }
  });
  it("uses ellipses only for an actual omitted range", () => {
    expect(getPaginationItems(5, 17)).toEqual([1, 2, "ellipsis", 4, 5, 6, "ellipsis", 16, 17]);
    for (let current = 1; current <= 101; current++) {
      const items = getPaginationItems(current, 101);
      items.forEach((item, i) => {
        if (item === "ellipsis") {
          expect(typeof items[i - 1]).toBe("number");
          expect(typeof items[i + 1]).toBe("number");
          expect((items[i + 1] as number) - (items[i - 1] as number)).toBeGreaterThan(1);
        }
      });
    }
  });
  it("clamps a stale page after a collection shrinks", () => {
    expect(getPaginationItems(101, 2)).toEqual([1, 2]);
    expect(getPaginationItems(-1, 11)).toEqual(getPaginationItems(1, 11));
  });
  it("handles invalid numbers without allocating an unbounded array", () => {
    expect(getPaginationItems(1, Infinity)).toEqual([]);
    expect(getPaginationItems(NaN, 1)).toEqual([1]);
    expect(getPaginationItems(5, Number.MAX_SAFE_INTEGER).length).toBeLessThanOrEqual(9);
  });
});
