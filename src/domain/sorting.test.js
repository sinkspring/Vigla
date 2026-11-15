import { describe, expect, test } from "vitest";
import { compareBy, sortRows } from "./sorting.js";

describe("compareBy", () => {
  const items = [{ v: 3 }, { v: 1 }, { v: 2 }];

  test("sorts numbers ascending by default", () => {
    expect(items.toSorted(compareBy((x) => x.v)).map((x) => x.v)).toEqual([
      1, 2, 3,
    ]);
  });

  test("sorts descending when asked", () => {
    expect(
      items.toSorted(compareBy((x) => x.v, "desc")).map((x) => x.v),
    ).toEqual([3, 2, 1]);
  });

  test("puts null last in both directions", () => {
    const withNull = [{ v: null }, ...items];
    const asc = withNull.toSorted(compareBy((x) => x.v)).map((x) => x.v);
    const desc = withNull
      .toSorted(compareBy((x) => x.v, "desc"))
      .map((x) => x.v);
    expect(asc).toEqual([1, 2, 3, null]);
    expect(desc).toEqual([3, 2, 1, null]);
  });

  test("mixed types: a number goes before a string, reversed when descending", () => {
    const self = (x) => x;
    expect(compareBy(self)(1, "a")).toBeLessThan(0);
    expect(compareBy(self)("a", 1)).toBeGreaterThan(0);
    expect(compareBy(self, "desc")(1, "a")).toBeGreaterThan(0);
    expect(compareBy(self, "desc")("a", 1)).toBeLessThan(0);
  });

  test("mixed types: never returns NaN", () => {
    expect(compareBy((x) => x)("a", 1)).not.toBeNaN();
  });
});

describe("sortRows", () => {
  test("returns a sorted copy and leaves the input unchanged", () => {
    const rows = [{ v: 2 }, { v: 1 }];
    const sorted = sortRows(rows, (r) => r.v);
    expect(sorted.map((r) => r.v)).toEqual([1, 2]);
    expect(rows.map((r) => r.v)).toEqual([2, 1]);
  });

  test("sorts numbers numerically, not as strings", () => {
    const rows = [10, 9, 1, 100].map((v) => ({ v }));
    expect(sortRows(rows, (r) => r.v).map((r) => r.v)).toEqual([1, 9, 10, 100]);
  });

  test("sorts strings alphabetically", () => {
    const rows = [{ name: "US_LaL-1%" }, { name: "BR_broad_CPI" }];
    expect(sortRows(rows, (r) => r.name).map((r) => r.name)).toEqual([
      "BR_broad_CPI",
      "US_LaL-1%",
    ]);
  });

  test("mixed types: numbers, then strings, then nulls", () => {
    const rows = ["b", 2, null, "a", 10, 1].map((v) => ({ v }));
    expect(sortRows(rows, (r) => r.v).map((r) => r.v)).toEqual([
      1,
      2,
      10,
      "a",
      "b",
      null,
    ]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([
      "b",
      "a",
      10,
      2,
      1,
      null,
    ]);
  });

  test("sorts strings with localeCompare, not by character codes", () => {
    const rows = [{ v: "Beta" }, { v: "alpha" }];
    // by code units "B" (66) < "a" (97), so `<` would give ["Beta", "alpha"]
    expect(sortRows(rows, (r) => r.v).map((r) => r.v)).toEqual([
      "alpha",
      "Beta",
    ]);
  });
});
