import { describe, expect, test } from "vitest";
import { defaultView, tableOptions } from "./view.js";
import { buildTable } from "../domain/table.js";
import { fixture, asOf, campaigns } from "../data/fixture.js";

test("view survives a JSON round trip", () => {
  expect(JSON.parse(JSON.stringify(defaultView))).toEqual(defaultView);
});

test("default view is a valid table config", () => {
  const state = { asOf, campaigns, view: defaultView };
  expect(() => buildTable(fixture, tableOptions(state))).not.toThrow();
});

test("tableOptions gives rows their campaign names and networks", () => {
  const state = { asOf, campaigns, view: defaultView };
  const table = buildTable(fixture, tableOptions(state));
  const row = table.rows.find((r) => r.key === "applovin:5f8a66qb");
  expect(row.label).toBe("US_Puzzle,Android_ROAS");
  expect(row.attributes.network).toBe("applovin");
});

describe("name search", () => {
  const tableFor = (search) =>
    buildTable(
      fixture,
      tableOptions({ asOf, campaigns, view: { ...defaultView, search } }),
    );

  test.each(["puzzle", "PUZZLE", "  puzzle "])(
    "%j finds the four puzzle campaigns; the total covers only them",
    (search) => {
      const table = tableFor(search);
      expect(table.rows).toHaveLength(4);
      expect(table.total.cells.spend.value).toBe(25000);
    },
  );

  test("a blank search keeps every campaign", () => {
    expect(tableFor("   ").rows).toHaveLength(7);
  });

  test("no match leaves no rows", () => {
    expect(tableFor("tiktok").rows).toEqual([]);
  });
});
