import { matchesName, networkOf } from "../domain/metrics.js";

const defaultView = {
  columns: [
    { metric: "spend" },
    { metric: "installs" },
    { metric: "cpi" },
    { metric: "cpm" },
    { metric: "ipm" },
    { metric: "rr", n: 7 },
    { metric: "payerRate", n: 7 },
    { metric: "cppu", n: 7 },
    { metric: "revenue", n: 7 },
    { metric: "roas", n: 7 },
    { metric: "arpu", n: 7 },
  ],
  sort: { column: "spend", direction: "desc" },
  filters: { from: "2026-01-01", to: null, networks: [], countries: [] },
  search: "",
};

const TEXT_COLUMNS = ["label", "network"];

/** Turns state into `buildTable` options; the only place the view meets `buildTable`.
 *
 * The name search becomes a `campaignIds` filter, so the total covers only the found campaigns.
 *
 * @param {Object} state - App state
 * @returns {Object} Options for `buildTable`
 */
function tableOptions(state) {
  const names = new Map(state.campaigns.map((c) => [c.id, c.name]));
  const { search, filters } = state.view;
  const campaignIds = search.trim()
    ? state.campaigns
        .filter((c) => matchesName(c.name, search))
        .map((c) => c.id)
    : undefined;

  return {
    keyFunc: (r) => r.campaignId,
    labelOf: (key) => names.get(key),
    attributes: { network: networkOf },
    asOf: state.asOf,
    columns: state.view.columns,
    filters: { ...filters, campaignIds },
    sort: state.view.sort,
  };
}

/** Sort after a click on a column header: the same column flips direction, another one starts with its first direction.
 *
 * @param {{column: string, direction: "asc" | "desc"}} sort - Current `view.sort`
 * @param {string} column - Clicked column key, e.g. "cpi", "roasD7" or "label"
 * @returns {{column: string, direction: "asc" | "desc"}}
 */
function nextSort(sort, column) {
  if (sort.column === column) {
    return { column, direction: sort.direction === "asc" ? "desc" : "asc" };
  }
  return { column, direction: TEXT_COLUMNS.includes(column) ? "asc" : "desc" };
}

export { defaultView, tableOptions, nextSort };
