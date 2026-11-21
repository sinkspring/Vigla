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
  filters: { from: null, to: null, networks: [], countries: [] },
  search: "",
};

/** Turns state into `buildTable` options; the only place the view meets `buildTable`.
 *
 * @param {Object} state - App state
 * @returns {Object} Options for `buildTable`
 */
function tableOptions(state) {
  return {
    keyFunc: (r) => r.campaignId,
    asOf: state.asOf,
    columns: state.view.columns,
    filters: state.view.filters,
    sort: state.view.sort,
  };
}

export { defaultView, tableOptions };
