import { Temporal } from "@js-temporal/polyfill";

/**
 * One daily row: date × campaign × country (ADR-001). See docs/domain.md, "Data dictionary".
 * Cohort fields (`retainedD{n}`, `payersD{n}`, `iapRevD{n}`, `adRevD{n}`, `revD{n}`)
 * are read by computed keys, so they are not listed here.
 *
 * @typedef {Object} DailyRow
 * @property {string} date - Install day, `"YYYY-MM-DD"` (ADR-014)
 * @property {string} campaignId - `network:networkCampaignId` (ADR-004)
 * @property {string | null} country - ISO alpha-2, or null when the source has no country split
 * @property {number} spend - USD
 * @property {number} installs
 * @property {number | null} [impressions]
 * @property {number | null} [clicks]
 */

/**
 * Sums over the rows that pass one slice's filters (ADR-012).
 *
 * @typedef {Object} Slice
 * @property {number | null} sum - Σ of the slice's own field; always null in `all`
 * @property {number | null} spend - Σ spend of the passing rows
 * @property {number | null} installs - Σ installs of the passing rows
 * @property {number | null} coverage - Slice spend ÷ group spend, from 0 to 1;
 *   null when the group spend is 0 or missing
 */

/**
 * Result of {@link aggregate}: one slice per kind of metric input.
 *
 * @typedef {Object} Aggregate
 * @property {Slice} all - Every row (spend, installs, CPI)
 * @property {Slice} impressions - Rows with impressions (CPM, IPM)
 * @property {Slice} retained - Mature rows with `retainedDn`
 * @property {Slice} payers - Mature rows with `payersDn`
 * @property {Slice} revenue - Mature rows with revenue for day n
 */

/** Adds up one numeric value across rows, read by a function.
 *
 * Skips null and undefined values (missing data is not treated as 0).
 * Returns null if no row has a value, including empty input,
 * so "no data" stays distinguishable from a real 0.
 *
 * @template T
 * @param {Array<T>} rows - Rows of any shape
 * @param {(row: T) => number | null | undefined} valueOf - Returns the value of one row,
 *   e.g. `(row) => revenueD(row, 7)`
 * @returns {number | null} Sum of all non-null values, or null if there are none
 */
function sumByFunc(rows, valueOf) {
  let sum = 0;
  let hasValue = false;
  for (const row of rows) {
    const value = valueOf(row);
    if (value != null) {
      sum += value;
      hasValue = true;
    }
  }
  return hasValue ? sum : null;
}

/** Adds up one numeric field across rows. See {@link sumByFunc} for the null rules.
 *
 * @param {Array<DailyRow>} rows - Data rows
 * @param {string} field - Name of the field to sum, e.g. `spend`
 * @returns {number | null} Sum of all non-null values, or null if there are none
 */
function sumBy(rows, field) {
  return sumByFunc(rows, (row) => row[field]);
}

/** Divides numerator by denominator. Returns null when the denominator is 0, or when either value is null or undefined (ADR-011).
 *
 * @param {number | null} numerator
 * @param {number | null} denominator
 * @returns {number | null}
 */
function safeDivide(numerator, denominator) {
  if (denominator === 0 || denominator == null || numerator == null)
    return null;
  return numerator / denominator;
}

/** Splits rows into groups by a key.
 *
 * @param {Array<Object>} rows - Data rows;
 * @param {(row: Object) => string} keyFunc - Returns the group key for a row, e.g. `(row) => row.campaignId`
 * @returns {Object<string, Array<Object>>} Null-prototype object: key → rows, in original order
 */
function groupBy(rows, keyFunc) {
  return Object.groupBy(rows, keyFunc);
}

/** Whether a cohort is old enough for day-n metrics: `date + n ≤ asOf` (ADR-003).
 *
 * @param {string | Temporal.PlainDate} date - Install date of the cohort (the row's date)
 * @param {number} n - Cohort window in days, e.g. 7 for D7
 * @param {string | Temporal.PlainDate} asOf - Last day the upload's revenue covers
 * @returns {boolean}
 */
function isMature(date, n, asOf) {
  const asOfT = Temporal.PlainDate.from(asOf);
  const dateT = Temporal.PlainDate.from(date);

  return Temporal.PlainDate.compare(dateT.add({ days: n }), asOfT) <= 0;
}

/** Revenue of one row for day-n cohort, gross: `iapRevDn + adRevDn` when both exist,
 * otherwise whichever exists, otherwise `revDn` (domain.md, "Revenue per row").
 *
 * Returns null when the row has no revenue for that window (immature or not tracked, ADR-006).
 * Net IAP (store fee, VAT, ADR-005) is not applied yet.
 *
 * @param {Object} row - One daily row
 * @param {number} n - Cohort window in days, e.g. 7 for D7
 * @returns {number | null}
 */
function revenueD(row, n) {
  const iap = row[`iapRevD${n}`];
  const ad = row[`adRevD${n}`];
  if (iap != null && ad != null) return iap + ad;
  if (iap != null) return iap;
  if (ad != null) return ad;

  return row[`revD${n}`] ?? null;
}

/** Keeps the rows that pass the screen filters (install dates, network, country).
 *
 * Every filter is optional (missing or empty filter keeps all rows)
 * Returns a new array
 *
 * @param {Array<Object>} rows - Daily rows (domain.md, `DailyRow`)
 * @param {Object} [filters]
 * @param {string | Temporal.PlainDate} [filters.from] - First install date, inclusive
 * @param {string | Temporal.PlainDate} [filters.to] - Last install date, inclusive
 * @param {Array<string>} [filters.networks] - e.g. `["unity", "meta"]`; read from `campaignId` (ADR-004)
 * @param {Array<string>} [filters.countries] - ISO alpha-2 codes, e.g. `["US"]`
 * @returns {Array<Object>}
 */
function filterRows(rows, { from, to, networks, countries } = {}) {
  const fromDate = from == null ? null : Temporal.PlainDate.from(from);
  const toDate = to == null ? null : Temporal.PlainDate.from(to);

  return rows.filter((row) => {
    const date = Temporal.PlainDate.from(row.date);
    if (fromDate && Temporal.PlainDate.compare(date, fromDate) < 0)
      return false;
    if (toDate && Temporal.PlainDate.compare(date, toDate) > 0) return false;
    if (networks?.length && !networks.includes(row.campaignId.split(":")[0]))
      return false;
    if (countries?.length && !countries.includes(row.country)) return false;
    return true;
  });
}

/** Sums one group of rows into slices, one per kind of metric input,
 * each with its own coverage (ADR-012).
 *
 * @param {Array<DailyRow>} rows - Rows of one group
 * @param {number} n - Cohort window in days, e.g. 7 for D7
 * @param {string | Temporal.PlainDate} asOf - Last day the upload's revenue covers
 * @returns {Aggregate}
 */
function aggregate(rows, n, asOf) {
  const totalSpend = sumBy(rows, "spend");
  const mature = rows.filter((row) => isMature(row.date, n, asOf));

  const totals = (passing) => {
    const spend = sumBy(passing, "spend");
    return {
      spend,
      installs: sumBy(passing, "installs"),
      coverage: totalSpend
        ? safeDivide(spend ?? 0, totalSpend)
        : safeDivide(passing.length, rows.length),
    };
  };

  const slice = (list, valueOf) => {
    const passing = [];
    const values = [];
    for (const row of list) {
      const value = valueOf(row);
      if (value != null) {
        passing.push(row);
        values.push(value);
      }
    }
    return { sum: sumByFunc(values, (value) => value), ...totals(passing) };
  };

  return {
    all: { sum: null, ...totals(rows) },
    impressions: slice(rows, (row) => row.impressions),
    retained: slice(mature, (row) => row[`retainedD${n}`]),
    payers: slice(mature, (row) => row[`payersD${n}`]),
    revenue: slice(mature, (row) => revenueD(row, n)),
  };
}

/** Cost per install. Returns null when `installs` is 0, null or undefined.
 *
 * @param {number} spend - Total spend for the group
 * @param {number | null} installs - Total installs for the group
 * @returns {number | null}
 */
function cpi(spend, installs) {
  return safeDivide(spend, installs);
}

/** Cost per mille (1000 impressions). Returns null when `impressions` is 0, null or undefined.
 *
 * @param {number} spend - Total spend for the group
 * @param {number | null} impressions - Total impressions for the group
 * @returns {number | null}
 */
function cpm(spend, impressions) {
  const perImpression = safeDivide(spend, impressions);
  return perImpression === null ? null : perImpression * 1000;
}

/** Installs per mille (1000 impressions). Returns null when `impressions` is 0, null or undefined.
 *
 * @param {number} installs - Total installs for the group
 * @param {number | null} impressions - Total impressions for the group
 * @returns {number | null}
 */
function ipm(installs, impressions) {
  const perImpression = safeDivide(installs, impressions);
  return perImpression === null ? null : perImpression * 1000;
}

/** Retention rate on day n: `retainedDn / installs`. Returns null when `installs` is 0, null or undefined.
 *
 * @param {number | null} retained - Total users active on day n, mature rows only
 * @param {number | null} installs - Total installs of the same rows
 * @returns {number | null} Share from 0 to 1, e.g. 0.3 for 30%
 */
function retentionRate(retained, installs) {
  return safeDivide(retained, installs);
}

/** Payer rate by day n: `payersDn / installs`. Returns null when `installs` is 0, null or undefined.
 *
 * @param {number | null} payers - Total payers in days 0…n, mature rows only
 * @param {number | null} installs - Total installs of the same rows
 * @returns {number | null} Share from 0 to 1
 */
function payerRate(payers, installs) {
  return safeDivide(payers, installs);
}

/** Cost per paying user by day n: `spend / payersDn`. Returns null when `payers` is 0, null or undefined.
 *
 * @param {number | null} spend - Total spend of the rows that have payers
 * @param {number | null} payers - Total payers by day n
 * @returns {number | null}
 */
function cppu(spend, payers) {
  return safeDivide(spend, payers);
}

/** Revenue by day n (additive, so no division). Turns undefined into null so every metric has the same "no data" value (ADR-006).
 *
 * @param {number | null | undefined} total - Σ revenueD over mature rows
 * @returns {number | null}
 */
function revenue(total) {
  return total ?? null;
}

/** Return on ad spend by day n: `revenueDn / spend`. Returns null when `spend` is 0, null or undefined.
 *
 * @param {number | null} revenueTotal - Σ revenueD over mature rows
 * @param {number | null} spend - Spend of the same rows (see ADR-003)
 * @returns {number | null} Ratio, e.g. 0.2167 for 21.67%
 */
function roas(revenueTotal, spend) {
  return safeDivide(revenueTotal, spend);
}

/** Average revenue per user by day n: `revenueDn / installs`. Returns null when `installs` is 0, null or undefined.
 *
 * @param {number | null} revenueTotal - Σ revenueD over mature rows
 * @param {number | null} installs - Installs of the same rows
 * @returns {number | null}
 */
function arpu(revenueTotal, installs) {
  return safeDivide(revenueTotal, installs);
}

/** Builds a comparator for `Array.prototype.sort` / `toSorted`. Numbers sort numerically,
 * strings with `localeCompare`, and null/undefined go last in both directions.
 *
 * @param {(item: Object) => number | string | null} getValue - Picks the value to sort by, e.g. `(row) => row.cells.cpi.value`
 * @param {"asc" | "desc"} [direction="asc"]
 * @returns {(a: Object, b: Object) => number} Negative if a goes first, positive if b goes first, 0 to keep order
 */
function compareBy(getValue, direction = "asc") {
  const sign = direction === "desc" ? -1 : 1;
  return (a, b) => {
    const x = getValue(a);
    const y = getValue(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "string" && typeof y === "string")
      return sign * x.localeCompare(y);
    if (typeof x !== typeof y) return sign * (typeof x === "number" ? -1 : 1);
    return sign * (x - y);
  };
}

/** Returns a sorted copy of `rows`; the input array is not changed. Equal values keep their order (stable sort).
 *
 * @param {Array<Object>} rows
 * @param {(item: Object) => number | string | null} getValue - See compareBy
 * @param {"asc" | "desc"} [direction="asc"]
 * @returns {Array<Object>}
 */
function sortRows(rows, getValue, direction = "asc") {
  return rows.toSorted(compareBy(getValue, direction));
}

const FORMATTERS = {
  // `$#,##0`: spend, revenue. Currency defaults to 2 decimals, so BOTH min and max must be set to 0
  // Both set explicitly: older engines threw a RangeError when only max was below the currency default.
  money0: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  // `$0.00`: CPI, CPM, CPPU, ARPU. USD already has 2 decimals by default.
  money2: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }),
  // `#,##0`: installs.
  int: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }),
  // `0.0`: IPM.
  dec1: new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }),
  // `0.0%`: RR, ROAS. style "percent" multiplies by 100 itself, so pass 0.213, not 21.3.
  pct1: new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }),
  // `0.00%`: payer rate (small numbers like 2.83% need the extra digit).
  pct2: new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

/** Formats a metric value for display; the only place values are rounded (ADR-015).
 *
 * Returns "—" for null, undefined, NaN and ±Infinity (ADR-011: no denominator, no value).
 * Throws on an unknown format name, so a typo fails loudly instead of showing raw numbers.
 *
 * @param {number | null | undefined} value - Unrounded value
 * @param {"money0" | "money2" | "int" | "dec1" | "pct1" | "pct2"} format - Display format from domain.md
 * @returns {string} e.g. "$4.02", "21.3%", "—"
 */
function formatMetric(value, format) {
  const formatter = FORMATTERS[format];
  if (!formatter) throw new Error(`Unknown format: ${format}`);
  if (value == null || !Number.isFinite(value)) return "—";
  return formatter.format(value);
}

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
    compute: (s) => cpi(s.spend, s.installs),
  },
  // CPM/IPM use the impressions slice, so spend without impressions (Mintegral) is left out.
  cpm: {
    label: "CPM",
    source: "impressions",
    format: "money2",
    compute: (s) => cpm(s.spend, s.sum),
  },
  ipm: {
    label: "IPM",
    source: "impressions",
    format: "dec1",
    compute: (s) => ipm(s.installs, s.sum),
  },
  rr: {
    label: "RR",
    source: "retained",
    format: "pct1",
    cohort: true,
    compute: (s) => retentionRate(s.sum, s.installs),
  },
  payerRate: {
    label: "Payer %",
    source: "payers",
    format: "pct2",
    cohort: true,
    compute: (s) => payerRate(s.sum, s.installs),
  },
  cppu: {
    label: "CPPU",
    source: "payers",
    format: "money2",
    cohort: true,
    compute: (s) => cppu(s.spend, s.sum),
  },
  revenue: {
    label: "Revenue",
    source: "revenue",
    format: "money0",
    cohort: true,
    compute: (s) => revenue(s.sum),
  },
  roas: {
    label: "ROAS",
    source: "revenue",
    format: "pct1",
    cohort: true,
    compute: (s) => roas(s.sum, s.spend),
  },
  arpu: {
    label: "ARPU",
    source: "revenue",
    format: "money2",
    cohort: true,
    compute: (s) => arpu(s.sum, s.installs),
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
function buildTable(
  rows,
  { keyFunc, columns, asOf, filters = {}, sort = null },
) {
  const filtered = filterRows(rows, filters);
  const groups = groupBy(filtered, keyFunc);
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
      byWindow[column.n] ??= aggregate(groupRows, column.n, asOf);
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
        text: formatMetric(value, column.format) + (partial ? "*" : ""),
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
    ? sortRows(
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

export {
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
};
