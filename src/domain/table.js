import * as metrics from "./metrics.js";
import * as sorting from "./sorting.js";
import * as format from "./format.js";

const METRICS = {
  spend: {
    label: "Spend",
    source: "all",
    format: "money0",
    compute: (s) => s.spend,
  },
  installs: {
    label: "Installs",
    source: "all",
    format: "int",
    compute: (s) => s.installs,
  },
  cpi: {
    label: "CPI",
    source: "all",
    format: "money2",
    compute: (s) => metrics.cpi(s.spend, s.installs),
  },
  // CPM/IPM use the impressions slice, so spend without impressions (Mintegral) is left out.
  cpm: {
    label: "CPM",
    source: "impressions",
    format: "money2",
    compute: (s) => metrics.cpm(s.spend, s.sum),
  },
  ipm: {
    label: "IPM",
    source: "impressions",
    format: "dec1",
    compute: (s) => metrics.ipm(s.installs, s.sum),
  },
  rr: {
    label: "RR",
    source: "retained",
    format: "pct1",
    cohort: true,
    compute: (s) => metrics.retentionRate(s.sum, s.installs),
  },
  payerRate: {
    label: "Payer %",
    source: "payers",
    format: "pct2",
    cohort: true,
    compute: (s) => metrics.payerRate(s.sum, s.installs),
  },
  cppu: {
    label: "CPPU",
    source: "payers",
    format: "money2",
    cohort: true,
    compute: (s) => metrics.cppu(s.spend, s.sum),
  },
  revenue: {
    label: "Revenue",
    source: "revenue",
    format: "money0",
    cohort: true,
    compute: (s) => metrics.revenue(s.sum),
  },
  roas: {
    label: "ROAS",
    source: "revenue",
    format: "pct1",
    cohort: true,
    compute: (s) => metrics.roas(s.sum, s.spend),
  },
  arpu: {
    label: "ARPU",
    source: "revenue",
    format: "money2",
    cohort: true,
    compute: (s) => metrics.arpu(s.sum, s.installs),
  },
};

/** Builds a table: filter → group → aggregate → metric → cell state (ADR-012) → format → sort.
 *
 * Each cell is `{ value, text, state, coverage }`, where state is one of domain.md's cell states:
 * "value" (coverage 100%), "partial" (50% to under 100%, text ends in `*`), "blank" (under 50%, empty text),
 * "undefined" (denominator 0, text "—"). The total row is blended: computed from all filtered rows, not averaged.
 *
 * @param {Array<Object>} rows - Daily rows
 * @param {Object} options
 * @param {(row: Object) => string} options.keyFunc - Group key, e.g. `(row) => row.campaignId`
 * @param {Array<{metric: string, n?: number}>} options.columns - e.g. `[{ metric: "spend" }, { metric: "roas", n: 7 }]`
 * @param {string | Temporal.PlainDate} options.asOf - Last day the upload's revenue covers
 * @param {Object} [options.filters] - Passed to filterRows
 * @param {{column: string, direction?: "asc" | "desc"}} [options.sort] - Column key, e.g. "spend" or "roasD7"
 * @returns {{columns: Array<{key: string, label: string}>, rows: Array<{key: string, cells: Object}>, total: {key: string, cells: Object}}}
 */
export function buildTable(
  rows,
  { keyFunc, columns, asOf, filters = {}, sort = null },
) {
  const filtered = metrics.filterRows(rows, filters);
  const groups = metrics.groupBy(filtered, keyFunc);
  const columnDefs = columns.map(({ metric, n = 0 }) => {
    const definition = METRICS[metric];
    if (!definition) throw new Error(`Unknown metric: ${metric}`);
    const key = definition.cohort ? `${metric}D${n}` : metric;
    const label = definition.cohort
      ? `${definition.label} D${n}`
      : definition.label;
    return { ...definition, n, key, label };
  });

  if (sort && !columnDefs.some((column) => column.key === sort.column)) {
    throw new Error(`Unknown sort column: ${sort.column}`);
  }

  const buildCells = (groupRows) => {
    const byWindow = {};
    const cells = {};
    for (const column of columnDefs) {
      byWindow[column.n] ??= metrics.aggregate(groupRows, column.n, asOf);
      const slice = byWindow[column.n][column.source];
      const { coverage } = slice;

      if (coverage == null || coverage < 0.5) {
        cells[column.key] = { value: null, text: "", state: "blank", coverage };
        continue;
      }

      const value = column.compute(slice);
      if (value == null) {
        cells[column.key] = {
          value: null,
          text: "—",
          state: "undefined",
          coverage,
        };
        continue;
      }

      // 50% to under 100% → partial, marked with "*".
      const partial = coverage < 1;
      cells[column.key] = {
        value,
        text: format.formatMetric(value, column.format) + (partial ? "*" : ""),
        state: partial ? "partial" : "value",
        coverage,
      };
    }
    return cells;
  };

  const tableRows = Object.entries(groups).map(([key, groupRows]) => ({
    key,
    cells: buildCells(groupRows),
  }));
  const sortedRows = sort
    ? sorting.sortRows(
        tableRows,
        (row) => row.cells[sort.column]?.value,
        sort.direction,
      )
    : tableRows;

  return {
    columns: columnDefs.map(({ key, label }) => ({ key, label })),
    rows: sortedRows,
    total: { key: "Total", cells: buildCells(filtered) },
  };
}
