import { Temporal } from "@js-temporal/polyfill";

/** Adds up one numeric field across rows.
 *
 * Skips null and undefined values (missing data is not treated as 0).
 * Returns null if no row has a value for the field, including empty input,
 * so "no data" stays distinguishable from a real 0.
 *
 * @param {Array<Object>} rows - Data rows; field values must be numbers or null.
 * @param {string} field - Name of the field to sum, e.g. `spend`.
 * @returns {number | null} Sum of all non-null values, or null if there are none.
 */
function sumBy(rows, field) {
  let sum = 0;
  let hasValue = false;
  for (const row of rows) {
    const value = row[field];
    if (value != null) {
      sum += value;
      hasValue = true;
    }
  }
  return hasValue ? sum : null;
}

/** Divides numerator by denominator. Returns null when the denominator is 0, null or undefined (ADR-011).
 *
 * @param {number} numerator
 * @param {number | null} denominator
 * @returns {number | null}
 */
function safeDivide(numerator, denominator) {
  if (denominator === 0 || denominator == null) return null;
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
 * @param {Temporal.PlainDate} date - Install date of the cohort (the row's date)
 * @param {number} n - Cohort window in days, e.g. 7 for D7
 * @param {Temporal.PlainDate} asOf - Last day the upload's revenue covers
 * @returns {boolean}
 */
function isMature(date, n, asOf) {
  return Temporal.PlainDate.compare(date.add({ days: n }), asOf) <= 0;
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
 * @param {number | null} impressions -  Total impressions for the group
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

export { sumBy, safeDivide, groupBy, isMature, cpi, cpm, ipm };
