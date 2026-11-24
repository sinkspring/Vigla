import { describe, expect, test } from "vitest";
import { fixture, asOf, campaigns } from "../data/fixture.js";
import { networkOf } from "./metrics.js";
import { buildTable } from "./table.js";

describe("buildTable", () => {
  const columns = [
    { metric: "spend" },
    { metric: "cpi" },
    { metric: "cpm" },
    { metric: "cppu", n: 1 },
    { metric: "roas", n: 7 },
  ];

  test("one row per campaign and a blended total CPI", () => {
    const table = buildTable(fixture, {
      keyFunc: (r) => r.campaignId,
      columns,
      asOf,
    });
    expect(table.rows).toHaveLength(7);
    expect(table.total.cells.spend.value).toBe(36070);
    expect(table.total.cells.cpi.value).toBeCloseTo(36070 / 8980, 4);
  });

  test("marks partial, blank and undefined cells", () => {
    const table = buildTable(fixture, {
      keyFunc: (r) => r.campaignId,
      columns,
      asOf,
    });
    const cellsOf = (key) => table.rows.find((r) => r.key === key).cells;
    // Meta: 4,100 of 6,300 spend is D7-mature → 65% coverage
    expect(cellsOf("meta:23861450").roasD7).toMatchObject({
      state: "partial",
      text: "21.2%*",
    });
    // Mintegral: no impressions → 0% coverage
    expect(cellsOf("mintegral:77d0e1").cpm).toMatchObject({
      state: "blank",
      text: "",
    });
    // Unity BR: 0 payers by D1 → no denominator
    expect(cellsOf("unity:b81c4d07").cppuD1).toMatchObject({
      state: "undefined",
      text: "—",
    });
  });

  test("applies filters and sorts by a column", () => {
    const table = buildTable(fixture, {
      keyFunc: (r) => r.campaignId,
      columns,
      asOf,
      filters: { networks: ["unity"] },
      sort: { column: "spend", direction: "desc" },
    });
    expect(table.rows.map((r) => r.key)).toEqual([
      "unity:a3e9f210",
      "unity:b81c4d07",
    ]);
  });

  test("throws on an unknown sort column", () => {
    expect(() =>
      buildTable(fixture, {
        keyFunc: (r) => r.campaignId,
        columns,
        asOf,
        sort: { column: "roasD8" },
      }),
    ).toThrow("Unknown sort column");
  });

  test.each([
    ["empty input", [], {}],
    ["filters exclude everything", fixture, { networks: ["tiktok"] }],
  ])("%s: no rows, columns kept, blank total", (_, input, filters) => {
    const table = buildTable(input, {
      keyFunc: (r) => r.campaignId,
      columns,
      asOf,
      filters,
    });

    expect(table.rows).toEqual([]);
    expect(table.columns).toHaveLength(columns.length);
    for (const cell of Object.values(table.total.cells)) {
      expect(cell).toMatchObject({ value: null, state: "blank", text: "" });
    }
  });

  test("zero-spend group: shows spend and installs, ROAS is undefined", () => {
    const rows = [
      {
        date: "2026-10-01",
        campaignId: "organic:x",
        country: "US",
        spend: 0,
        installs: 5,
        iapRevD0: 3,
      },
    ];
    const { cells } = buildTable(rows, {
      keyFunc: (r) => r.campaignId,
      columns: [
        { metric: "spend" },
        { metric: "installs" },
        { metric: "roas" },
      ],
      asOf,
    }).rows[0];
    expect(cells.spend).toMatchObject({ text: "$0", state: "value" });
    expect(cells.installs).toMatchObject({ text: "5", state: "value" });
    // Denominator (spend) is 0 → "—", not a blank cell
    expect(cells.roasD0).toMatchObject({
      value: null,
      text: "—",
      state: "undefined",
    });
  });

  describe("cell state thresholds (ADR-012)", () => {
    const twoRows = (matureSpend, youngSpend) => [
      {
        date: "2026-10-20",
        campaignId: "test:a",
        country: "US",
        spend: matureSpend,
        installs: 10,
        iapRevD7: 20,
      },
      {
        date: "2026-11-02", // D7 not over by asOf
        campaignId: "test:a",
        country: "US",
        spend: youngSpend,
        installs: 10,
      },
    ];

    test.each([
      [100, 100, "partial"], // exactly 50%
      [99, 101, "blank"], // 49.5%
      [199, 1, "partial"], // 99.5%
      [200, 0, "value"], // 100%
    ])("%i mature + %i young spend → %s", (mature, young, state) => {
      const table = buildTable(twoRows(mature, young), {
        keyFunc: (r) => r.campaignId,
        columns: [{ metric: "roas", n: 7 }],
        asOf,
      });
      expect(table.rows[0].cells.roasD7.state).toBe(state);
    });
  });

  test("builds column keys and labels, rejects unknown metrics", () => {
    const table = buildTable(fixture, {
      keyFunc: (r) => r.campaignId,
      columns: [{ metric: "spend" }, { metric: "roas", n: 7 }],
      asOf,
    });
    expect(table.columns).toEqual([
      { key: "spend", label: "Spend" },
      { key: "roasD7", label: "ROAS D7" },
    ]);

    expect(() =>
      buildTable(fixture, {
        keyFunc: (r) => r.campaignId,
        columns: [{ metric: "roi" }],
        asOf,
      }),
    ).toThrow("Unknown metric");
  });

  describe("row labels", () => {
    const names = new Map(campaigns.map((c) => [c.id, c.name]));
    const options = {
      keyFunc: (r) => r.campaignId,
      labelOf: (key) => names.get(key),
      columns,
      asOf,
    };
    const keys = (table) => table.rows.map((r) => r.key);

    test("rows get campaign names, the total its own", () => {
      const table = buildTable(fixture, options);
      const row = table.rows.find((r) => r.key === "applovin:5f8a66qb");
      expect(row.label).toBe("US_Puzzle,Android_ROAS");
      expect(table.total.label).toBe("Total");
    });

    test("a key without a name shows the key itself", () => {
      const table = buildTable(fixture, {
        ...options,
        labelOf: () => undefined,
      });
      for (const row of table.rows) expect(row.label).toBe(row.key);
    });

    test.each(["asc", "desc"])(
      "sorts by name %s, equal names keep their order",
      (direction) => {
        const before = keys(buildTable(fixture, options));
        const table = buildTable(fixture, {
          ...options,
          sort: { column: "label", direction },
        });

        const labels = table.rows.map((r) => r.label);
        const expected = labels.toSorted((a, b) => a.localeCompare(b));
        expect(labels).toEqual(
          direction === "asc" ? expected : expected.toReversed(),
        );

        // Both are named "DE_Puzzle_Android"
        const pair = ["applovin:7c21d9ka", "google:48210377"];
        const pairOrder = (list) => list.filter((key) => pair.includes(key));
        expect(pairOrder(keys(table))).toEqual(pairOrder(before));
      },
    );
  });
  describe("row attributes", () => {
    const options = {
      keyFunc: (r) => r.campaignId,
      attributes: { network: networkOf },
      columns,
      asOf,
    };

    test("rows get their network, the total gets null", () => {
      const table = buildTable(fixture, options);
      const row = table.rows.find((r) => r.key === "google:48210377");
      expect(row.attributes.network).toBe("google");
      expect(table.total.attributes.network).toBeNull();
    });

    test("sorts by an attribute", () => {
      const table = buildTable(fixture, {
        ...options,
        sort: { column: "network", direction: "asc" },
      });
      expect(table.rows.map((r) => r.attributes.network)).toEqual([
        "applovin",
        "applovin",
        "google",
        "meta",
        "mintegral",
        "unity",
        "unity",
      ]);
    });
  });
});
