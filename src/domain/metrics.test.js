import { describe, expect, test } from "vitest";
import { fixture, asOf } from "../data/fixture.js";
import {
  sumBy,
  sumByFunc,
  safeDivide,
  groupBy,
  isMature,
  revenueD,
  filterRows,
  aggregate,
  cpi,
  cpm,
  ipm,
  retentionRate,
  payerRate,
  cppu,
  revenue,
  roas,
  arpu,
  compareBy,
  sortRows,
  formatMetric,
  buildTable,
} from "./metrics.js";

const rowsOf = (campaignId) =>
  fixture.filter((r) => r.campaignId === campaignId);

describe("sumBy", () => {
  // Normal case
  test("adds one field across rows", () => {
    expect(sumBy([{ spend: 10 }, { spend: 5.5 }], "spend")).toBe(15.5);
  });

  // Empty input
  test("returns null for empty input", () => {
    expect(sumBy([], "spend")).toBeNull();
  });

  // Edge cases: null vs 0
  test("skips null values", () => {
    expect(sumBy([{ spend: 10 }, { spend: null }], "spend")).toBe(10);
  });

  test("skips missing fields", () => {
    expect(sumBy([{ spend: 10 }, {}], "spend")).toBe(10);
  });

  test("returns null when every value is null", () => {
    expect(sumBy([{ spend: null }, { spend: null }], "spend")).toBeNull();
  });

  test("returns 0, not null, when every value is 0", () => {
    expect(sumBy([{ spend: 0 }, { spend: 0 }], "spend")).toBe(0);
  });

  // Edge cases from the fixture
  test("includes the zero-install day in Unity BR spend", () => {
    expect(sumBy(rowsOf("unity:b81c4d07"), "spend")).toBe(670);
  });

  test("returns null for Mintegral impressions", () => {
    expect(sumBy(rowsOf("mintegral:77d0e1"), "impressions")).toBeNull();
  });

  test("returns 0 for Unity BR day-0 IAP revenue (real zeros, not missing)", () => {
    expect(sumBy(rowsOf("unity:b81c4d07"), "iapRevD0")).toBe(0);
  });
});

describe("sumByFunc", () => {
  test("sums values returned by a function", () => {
    const rows = rowsOf("mintegral:77d0e1");
    expect(sumByFunc(rows, (row) => revenueD(row, 7))).toBe(310);
  });

  test("returns null when the function gives no values", () => {
    expect(sumByFunc([{ a: 1 }, { a: 2 }], () => null)).toBeNull();
  });

  test("works on plain numbers", () => {
    expect(sumByFunc([1, 2, 3], (value) => value)).toBe(6);
  });
});

describe("safeDivide", () => {
  // Normal case
  test("Normal division", () => {
    expect(safeDivide(1500, 75)).toBe(20);
  });
  // Zero
  test("returns null as denominator is 0", () => {
    expect(safeDivide(1500, 0)).toBe(null);
  });
  // Null denominator
  test("returns null as denominator is null", () => {
    expect(safeDivide(1500, null)).toBe(null);
  });
  // Null numerator
  test("returns null as nominator is null", () => {
    expect(safeDivide(null, 75)).toBe(null);
  });
});

describe("groupBy", () => {
  test("splits the fixture into one group per campaign", () => {
    const groups = groupBy(fixture, (row) => row.campaignId);
    expect(Object.keys(groups)).toHaveLength(7);
  });

  test("keeps every row of a group, in original order", () => {
    const groups = groupBy(fixture, (row) => row.campaignId);
    expect(groups["meta:23861450"]).toEqual(rowsOf("meta:23861450"));
    expect(groups["meta:23861450"]).toHaveLength(3); // absent on Oct 22
  });

  test("returns no groups for empty input", () => {
    expect(Object.keys(groupBy([], (row) => row.campaignId))).toHaveLength(0);
  });
});

describe("isMature", () => {
  test("mature when date + n is before asOf", () => {
    expect(isMature("2026-10-20", 7, asOf)).toBe(true);
  });

  test("mature when date + n equals asOf", () => {
    expect(isMature("2026-11-02", 3, asOf)).toBe(true);
  });

  test("not mature when date + n is after asOf", () => {
    expect(isMature("2026-11-02", 7, asOf)).toBe(false);
  });
});

describe("aggregate", () => {
  test("the `all` slice sums every row, coverage 100%", () => {
    const { all } = aggregate(rowsOf("meta:23861450"), 7, asOf);
    expect(all.spend).toBe(6300);
    expect(all.installs).toBe(780);
    expect(all.coverage).toBe(1);
  });

  test("ROAS D7 ignores cohorts younger than 7 days", () => {
    const { revenue } = aggregate(rowsOf("meta:23861450"), 7, asOf);
    expect(revenue.sum).toBe(870);
    expect(revenue.spend).toBe(4100);
    expect(revenue.coverage).toBeCloseTo(4100 / 6300, 4);
  });

  test("CPM coverage leaves out the Mintegral row (no impressions)", () => {
    const { impressions } = aggregate(fixture, 0, asOf);
    // 36,070 total spend − 1,000 Mintegral spend
    expect(impressions.spend).toBe(35070);
    expect(impressions.sum).toBe(1447000);
    expect(impressions.coverage).toBeCloseTo(35070 / 36070, 4);
    // CPM divides only the spend that has impressions
    const value = cpm(impressions.spend, impressions.sum);
    expect(value).toBeCloseTo((35070 / 1447000) * 1000, 4);
    expect(value).not.toBeCloseTo((36070 / 1447000) * 1000, 4);
  });

  test("whole fixture matches the oracle: ROAS D7 over mature spend", () => {
    const { revenue, all } = aggregate(fixture, 7, asOf);
    expect(revenue.sum).toBe(5590);
    expect(revenue.spend).toBe(26250);
    expect(all.spend).toBe(36070);
    expect(roas(revenue.sum, revenue.spend)).toBeCloseTo(0.213, 4);
    expect(revenue.coverage).toBeCloseTo(26250 / 36070, 4);
  });

  test("payers slice leaves out Mintegral (no payersD7)", () => {
    const { payers } = aggregate(fixture, 7, asOf);
    // mature spend 26,250 − Mintegral 1,000
    expect(payers.spend).toBe(25250);
  });

  test("immature row with a partial value is still left out (ADR-003)", () => {
    const rows = [
      { date: "2026-10-20", spend: 100, installs: 10, payersD7: 1 },
      { date: "2026-11-02", spend: 100, installs: 10, payersD7: 1 }, // D7 not over yet
    ];
    const { payers } = aggregate(rows, 7, asOf);
    expect(payers.sum).toBe(1);
    expect(payers.coverage).toBe(0.5);
  });

  test("returns empty slices for empty input", () => {
    const empty = { sum: null, spend: null, installs: null, coverage: null };
    expect(aggregate([], 7, asOf)).toEqual({
      all: empty,
      impressions: empty,
      retained: empty,
      payers: empty,
      revenue: empty,
    });
  });

  test("zero-spend group: coverage is the share of rows that pass", () => {
    const rows = [
      { date: "2026-10-01", spend: 0, installs: 5, impressions: 100 },
      { date: "2026-10-02", spend: 0, installs: 3, impressions: null },
    ];
    const { all, impressions, revenue } = aggregate(rows, 7, asOf);
    // Spend share would be 0 ÷ 0, so rows are counted instead
    expect(all).toEqual({ sum: null, spend: 0, installs: 8, coverage: 1 });
    // 1 of 2 rows has impressions
    expect(impressions.coverage).toBe(0.5);
    // No row has D7 revenue
    expect(revenue.coverage).toBe(0);
  });

  test("group with spend: coverage is still the spend share, not the row share", () => {
    const rows = [
      { date: "2026-10-01", spend: 90, installs: 5, impressions: 100 },
      { date: "2026-10-02", spend: 10, installs: 3, impressions: null },
    ];
    // 1 of 2 rows, but 90 of 100 spend
    expect(aggregate(rows, 0, asOf).impressions.coverage).toBe(0.9);
  });
});

describe("filterRows", () => {
  test("keeps rows inside an inclusive date range", () => {
    // Oct 21: 7 rows, Oct 22: 5 rows (Meta is absent)
    const rows = filterRows(fixture, { from: "2026-10-21", to: "2026-10-22" });
    expect(rows).toHaveLength(12);
  });

  test("filters by network, read from campaignId", () => {
    const rows = filterRows(fixture, { networks: ["unity"] });
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.campaignId.startsWith("unity:"))).toBe(true);
  });

  test("returns every row, in a new array, when there are no filters", () => {
    const rows = filterRows(fixture);
    expect(rows).toEqual(fixture);
    expect(rows).not.toBe(fixture);
  });

  test("returns an empty array for empty input", () => {
    expect(filterRows([], { networks: ["unity"] })).toEqual([]);
  });

  test("empty filter arrays keep every row", () => {
    expect(filterRows(fixture, { networks: [], countries: [] })).toHaveLength(
      24,
    );
  });
});

describe("cpi", () => {
  // Normal case
  test("CPI is spend divided by installs", () => {
    expect(cpi(1500, 75)).toBe(20);
  });
  // Zero denominator
  test("returns null when `installs` is 0", () => {
    expect(cpi(1500, 0)).toBe(null);
  });
  // Case from the fixture
  test("Mintegral: 1000 spend / 250 installs = 4", () => {
    const rows = rowsOf("mintegral:77d0e1");
    const spend = sumBy(rows, "spend");
    const installs = sumBy(rows, "installs");

    expect(cpi(spend, installs)).toBe(4);
  });
});

describe("cpm", () => {
  // Normal case
  test("CPM is cost per mille (1000 impressions)", () => {
    expect(cpm(100, 50000)).toBe(2);
  });
  // Zero denominator
  test("returns null when `impressions` is 0", () => {
    expect(cpm(100, 0)).toBe(null);
  });
  // Case from the fixture
  test("Mintegral: 1000 spend / null impressions = null", () => {
    const rows = rowsOf("mintegral:77d0e1");
    const spend = sumBy(rows, "spend");
    const impressions = sumBy(rows, "impressions");

    expect(cpm(spend, impressions)).toBe(null);
  });
});

describe("ipm", () => {
  // Normal case
  test("IPM is installs per mille (1000 impressions)", () => {
    expect(ipm(200, 50000)).toBe(4);
  });
  // Zero denominator
  test("returns null when `impressions` is 0", () => {
    expect(ipm(200, 0)).toBe(null);
  });
  // Case from the fixture
  test("Mintegral: 250 installs / null impressions = null", () => {
    const rows = rowsOf("mintegral:77d0e1");
    const installs = sumBy(rows, "installs");
    const impressions = sumBy(rows, "impressions");

    expect(ipm(installs, impressions)).toBe(null);
  });
});

describe("revenueD", () => {
  test("adds IAP and ad revenue when the source has both", () => {
    expect(revenueD(rowsOf("applovin:5f8a66qb")[0], 7)).toBe(650);
  });

  test("falls back to revDn when there is no IAP/ad split", () => {
    expect(revenueD(rowsOf("mintegral:77d0e1")[0], 7)).toBe(310);
  });

  test("returns null for an immature window", () => {
    const nov2 = rowsOf("applovin:5f8a66qb").find(
      (r) => r.date === "2026-11-02",
    );
    expect(revenueD(nov2, 7)).toBeNull();
  });
});

describe("retentionRate", () => {
  test("RR is retained users divided by installs", () => {
    expect(retentionRate(180, 600)).toBe(0.3);
  });

  test("returns null when `installs` is 0", () => {
    expect(retentionRate(0, 0)).toBeNull();
  });

  test("Unity BR: 126 retained D1 / 630 installs = 20%, zero-install day included", () => {
    const rows = rowsOf("unity:b81c4d07");
    const value = retentionRate(
      sumBy(rows, "retainedD1"),
      sumBy(rows, "installs"),
    );
    expect(value).toBeCloseTo(0.2, 4);
  });
});

describe("payerRate", () => {
  test("payer rate is payers divided by installs", () => {
    expect(payerRate(12, 600)).toBe(0.02);
  });

  test("returns null when `installs` is null", () => {
    expect(payerRate(12, null)).toBeNull();
  });

  test("AppLovin US: 51 payers D7 / 1,800 mature installs", () => {
    const { payers } = aggregate(rowsOf("applovin:5f8a66qb"), 7, asOf);
    expect(payerRate(payers.sum, payers.installs)).toBeCloseTo(51 / 1800, 4);
  });
});

describe("cppu", () => {
  test("CPPU is spend divided by payers", () => {
    expect(cppu(3000, 12)).toBe(250);
  });

  test("returns null when `payers` is 0", () => {
    expect(cppu(100, 0)).toBeNull();
  });

  test("Unity BR has no payers by D1: null, not Infinity", () => {
    const { payers } = aggregate(rowsOf("unity:b81c4d07"), 1, asOf);
    expect(payers.spend).toBe(670);
    expect(cppu(payers.spend, payers.sum)).toBeNull();
  });
});

describe("revenue", () => {
  test("returns the summed revenue unchanged", () => {
    expect(revenue(650)).toBe(650);
  });

  test("returns null, not undefined, when there is no revenue", () => {
    expect(revenue(undefined)).toBeNull();
  });

  test("AppLovin US revenue D7, gross, mature cohorts = 1,950", () => {
    const slice = aggregate(rowsOf("applovin:5f8a66qb"), 7, asOf).revenue;
    expect(revenue(slice.sum)).toBe(1950);
  });
});

describe("roas", () => {
  test("ROAS is revenue divided by spend", () => {
    expect(roas(650, 3000)).toBeCloseTo(0.2167, 4);
  });

  test("returns null when `spend` is 0", () => {
    expect(roas(100, 0)).toBeNull();
  });

  test("Meta ROAS D7, gross: 870 / 4,100 mature spend, not / 6,300", () => {
    const slice = aggregate(rowsOf("meta:23861450"), 7, asOf).revenue;
    const value = roas(slice.sum, slice.spend);
    expect(value).toBeCloseTo(870 / 4100, 4);
    expect(value).not.toBeCloseTo(870 / 6300, 4);
  });
});

describe("arpu", () => {
  test("ARPU is revenue divided by installs", () => {
    expect(arpu(650, 600)).toBeCloseTo(1.0833, 4);
  });

  test("returns null when `installs` is 0", () => {
    expect(arpu(100, 0)).toBeNull();
  });

  test("Mintegral ARPU D7 from revD7: 310 / 250 = 1.24", () => {
    const slice = aggregate(rowsOf("mintegral:77d0e1"), 7, asOf).revenue;
    expect(arpu(slice.sum, slice.installs)).toBeCloseTo(1.24, 4);
  });
});

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
});

describe("formatMetric", () => {
  test("formats money with 0 and 2 decimals", () => {
    expect(formatMetric(36070, "money0")).toBe("$36,070");
    expect(formatMetric(36070 / 8980, "money2")).toBe("$4.02");
  });

  test("formats percentages from a 0–1 ratio", () => {
    expect(formatMetric(870 / 4100, "pct1")).toBe("21.2%");
    expect(formatMetric(51 / 1800, "pct2")).toBe("2.83%");
  });

  test('shows null as "—", not "$0.00"', () => {
    expect(formatMetric(null, "money2")).toBe("—");
  });
});

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
});
