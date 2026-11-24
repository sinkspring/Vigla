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

/** Network of a campaign: the part of its id before the colon
 *
 * @param {string} campaignId - e.g. `"applovin:5f8a66qb"`
 * @returns {string} e.g. `"applovin"`
 */
function networkOf(campaignId) {
  return campaignId.split(":")[0];
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
    if (networks?.length && !networks.includes(networkOf(row.campaignId)))
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

export {
  sumBy,
  sumByFunc,
  safeDivide,
  groupBy,
  isMature,
  revenueD,
  networkOf,
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
};
