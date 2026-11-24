import * as metrics from "./metrics.js";
import * as sorting from "./sorting.js";
import * as format from "./format.js";

/** Cells with less coverage than this are blank (ADR-012). */
const MIN_COVERAGE = 0.5;

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

/** Turns a column request into a full column definition with its key and label.
 *
 * @param {{metric: string, n?: number}} column - e.g. `{ metric: "roas", n: 7 }`
 * @returns {Object} METRICS entry plus `n`, `key` ("roasD7") and `label` ("ROAS D7")
 */
function resolveColumn({ metric, n = 0 }) {
  const definition = METRICS[metric];
  if (!definition) throw new Error(`Unknown metric: ${metric}`);

  if (!definition.cohort) {
    return { ...definition, n, key: metric };
  }
  return {
    ...definition,
    n,
    key: `${metric}D${n}`,
    label: `${definition.label} D${n}`,
  };
}

/** Builds one cell from a slice: blank, undefined, partial or value (ADR-012).
 *
 * @param {Object} column - Resolved column (see resolveColumn)
 * @param {Slice} stats - The slice the column's metric reads
 * @returns {{value: number | null, text: string, state: string, coverage: number | null}}
 */
function buildCell(column, stats) {
  const { coverage } = stats;

  if (coverage == null || coverage < MIN_COVERAGE) {
    return { value: null, text: "", state: "blank", coverage };
  }

  const value = column.compute(stats);
  if (value == null) {
    return { value: null, text: "—", state: "undefined", coverage };
  }

  // MIN_COVERAGE to under 100% → partial, marked with "*".
  const partial = coverage < 1;
  const text = format.formatMetric(value, column.format);
  return {
    value,
    text: partial ? `${text}*` : text,
    state: partial ? "partial" : "value",
    coverage,
  };
}

/** Picks what rows are sorted by: the label, an attribute or a cell value.
 *
 * @param {string} column - `"label"`, an attribute name or a column key
 * @param {Array<Object>} columnDefs - Resolved columns (see resolveColumn)
 * @param {Object} attributes - The `attributes` option of buildTable
 * @returns {(row: Object) => number | string | null}
 * @throws {Error} If `column` matches none of them
 */
function sortValueOf(column, columnDefs, attributes) {
  if (column === "label") return (row) => row.label;
  if (Object.hasOwn(attributes, column)) {
    return (row) => row.attributes[column];
  }
  if (columnDefs.some((def) => def.key === column)) {
    return (row) => row.cells[column].value;
  }
  throw new Error(`Unknown sort column: ${column}`);
}

/** Builds a table: filter → group → aggregate → metric → cell state → format → sort.
 *
 * Each cell is `{ value, text, state, coverage }`, where `state` is one of domain.md's cell states:
 * - `"value"`: coverage is 100%. `text` is the formatted value.
 * - `"partial"`: coverage is from `MIN_COVERAGE` up to but not including 100%. `text` ends in `*`.
 * - `"blank"`: coverage is under `MIN_COVERAGE` or unknown. `value` is null and `text` is empty.
 * - `"undefined"`: the metric's denominator is 0. `value` is null and `text` is `"—"`.
 *
 * Cohort metrics get one column per window: key `${metric}D${n}`, label `${label} D${n}`.
 * Other metrics use the metric name as key and the definition's label.
 *
 * The total row is blended. It is computed from all filtered rows, not averaged across groups.
 *
 * @param {Array<Object>} rows - Daily rows
 * @param {Object} options
 * @param {(row: Object) => string} options.keyFunc - Group key, e.g. `(row) => row.campaignId`
 * @param {(key: string) => string | undefined} [options.labelOf] - Row name for a group key; if it returns nothing, the key itself is shown
 * @param {Object<string, (key: string) => string>} [options.attributes] - Text columns of a group key, e.g. `{ network: networkOf }`
 * @param {Array<{metric: string, n?: number}>} options.columns - Metrics to show, in order
 *   `n` is the cohort window in days and defaults to 0. e.g. `[{ metric: "spend" }, { metric: "roas", n: 7 }]`
 * @param {string | Temporal.PlainDate} options.asOf - Last day the upload's revenue covers
 * @param {Object} [options.filters] - Passed to filterRows
 * @param {{column: string, direction?: "asc" | "desc"}} [options.sort] - Column key, e.g. "spend" or "roasD7", an attribute name, or "label" to sort by row name; the total row is never sorted
 * @returns {{columns: Array<{key: string, label: string}>, rows: Array<{key: string, label: string, attributes: Object, cells: Object}>, total: {key: string, label: string, attributes: Object, cells: Object}}}
 * @throws {Error} If a column names an unknown metric, or `sort.column` matches no column key or attribute
 */
export function buildTable(
  rows,
  {
    keyFunc,
    labelOf = () => undefined,
    attributes = {},
    columns,
    asOf,
    filters = {},
    sort = null,
  },
) {
  const columnDefs = columns.map(resolveColumn);

  const sortValue = sort && sortValueOf(sort.column, columnDefs, attributes);

  // One aggregate per cohort window, shared by all columns with that window.
  const buildCells = (groupRows) => {
    const aggregatesByWindow = {};
    const cells = {};
    for (const column of columnDefs) {
      aggregatesByWindow[column.n] ??= metrics.aggregate(
        groupRows,
        column.n,
        asOf,
      );
      const stats = aggregatesByWindow[column.n][column.source];
      cells[column.key] = buildCell(column, stats);
    }
    return cells;
  };

  // The total has no group key (null), so its attributes are null.
  const attributesOf = (key) =>
    Object.fromEntries(
      Object.entries(attributes).map(([name, valueOf]) => [
        name,
        key == null ? null : valueOf(key),
      ]),
    );

  const filtered = metrics.filterRows(rows, filters);
  const groups = metrics.groupBy(filtered, keyFunc);

  const tableRows = Object.entries(groups).map(([key, groupRows]) => ({
    key,
    label: labelOf(key) ?? key,
    attributes: attributesOf(key),
    cells: buildCells(groupRows),
  }));

  const sortedRows = sort
    ? sorting.sortRows(tableRows, sortValue, sort.direction)
    : tableRows;

  return {
    columns: columnDefs.map(({ key, label }) => ({ key, label })),
    rows: sortedRows,
    total: {
      key: "Total",
      label: "Total",
      attributes: attributesOf(null),
      cells: buildCells(filtered),
    },
  };
}
