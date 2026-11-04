import { expect, test } from "vitest";
import { cpi } from "./metrics.js";

test("CPI is spend divided by installs", () => {
  expect(cpi(1500, 75)).toBe(20);
});
