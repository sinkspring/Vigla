import "./styles.css";
import { fixture, campaigns, asOf } from "./data/fixture.extended.js";
import { networkOf } from "./domain/metrics.js";
import { defaultView, nextSort } from "./state/view.js";
import { render } from "./ui/render.js";

const state = {
  rows: fixture,
  campaigns,
  asOf,
  view: structuredClone(defaultView),
};

state.view.filters.to = asOf;

const table = document.querySelector("#mainContainer");
const networkSelect = document.querySelector("#networkFilter");
const fromInput = document.querySelector("#fromDate");
const toInput = document.querySelector("#toDate");
const searchInput = document.querySelector("#nameSearch");

const networks = new Set(state.rows.map((r) => networkOf(r.campaignId)));
networkSelect.append(...[...networks].sort().map((n) => new Option(n)));

fromInput.max = asOf;
toInput.max = asOf;

networkSelect.value = state.view.filters.networks[0] ?? "";
fromInput.value = state.view.filters.from ?? "";
toInput.value = state.view.filters.to ?? "";
searchInput.value = state.view.search;

networkSelect.addEventListener("change", (event) => {
  const { value } = event.target;
  state.view.filters.networks = value ? [value] : [];
  render(state, table);
});

fromInput.addEventListener("change", (event) => {
  state.view.filters.from = event.target.value || null;
  render(state, table);
});

toInput.addEventListener("change", (event) => {
  state.view.filters.to = event.target.value || null;
  render(state, table);
});

searchInput.addEventListener("input", (event) => {
  state.view.search = event.target.value;
  render(state, table);
});

table.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-key]");
  if (!button) return;

  const { key } = button.dataset;
  state.view.sort = nextSort(state.view.sort, key);
  render(state, table);

  const buttons = table.querySelectorAll("button[data-key]");
  [...buttons].find((b) => b.dataset.key === key)?.focus();
});

render(state, table);
