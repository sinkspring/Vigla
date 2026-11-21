import { expect, test } from "vitest";
import { defaultView, tableOptions } from "./view.js";
import { buildTable } from "../domain/table.js";
import { fixture, asOf } from "../data/fixture.js";

test("view survives a JSON round trip", () => {
  expect(JSON.parse(JSON.stringify(defaultView))).toEqual(defaultView);
});

test("default view is a valid table config", () => {
  const state = { asOf, view: defaultView };
  expect(() => buildTable(fixture, tableOptions(state))).not.toThrow();
});
