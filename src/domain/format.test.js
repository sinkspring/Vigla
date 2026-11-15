import { describe, expect, test } from "vitest";
import { formatMetric } from "./format.js";

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

  test.each([NaN, Infinity, -Infinity])('shows %s as "—"', (value) => {
    expect(formatMetric(value, "pct1")).toBe("—");
  });

  test("shows a real zero as a number, not as missing (ADR-006)", () => {
    expect(formatMetric(0, "money2")).toBe("$0.00");
    expect(formatMetric(0, "pct1")).toBe("0.0%");
  });

  test("formats integers and one decimal", () => {
    expect(formatMetric(8980, "int")).toBe("8,980");
    expect(formatMetric(1234.6, "int")).toBe("1,235");
    expect(formatMetric(5.68, "dec1")).toBe("5.7");
  });

  test("throws on an unknown format, even for null", () => {
    expect(() => formatMetric(1, "usd")).toThrow("Unknown format");
    expect(() => formatMetric(null, "usd")).toThrow("Unknown format");
  });
});
