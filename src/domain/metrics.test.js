import { describe, expect, test } from "vitest";
import {
  sumBy,
  safeDivide,
  groupBy,
  isMature,
  cpi,
  cpm,
  ipm,
} from "./metrics.js";
import { fixture, asOf } from "../data/fixture.js";
import { Temporal } from "@js-temporal/polyfill";

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

describe("safeDivide", () => {
  // Normal case
  test("Normal division", () => {
    expect(safeDivide(1500, 75)).toBe(20);
  });
  // Zero
  test("returns null as denominator is 0", () => {
    expect(safeDivide(1500, 0)).toBe(null);
  });
  // Null
  test("returns null as denominator is null", () => {
    expect(safeDivide(1500, null)).toBe(null);
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
  const day = (s) => Temporal.PlainDate.from(s);
  const asOfDay = day(asOf); // 2026-11-05

  test("mature when date + n is before asOf", () => {
    expect(isMature(day("2026-10-20"), 7, asOfDay)).toBe(true);
  });

  test("mature when date + n equals asOf", () => {
    expect(isMature(day("2026-11-02"), 3, asOfDay)).toBe(true);
  });

  test("not mature when date + n is after asOf", () => {
    expect(isMature(day("2026-11-02"), 7, asOfDay)).toBe(false);
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
