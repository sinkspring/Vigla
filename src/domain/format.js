const FORMATTERS = {
  // `$#,##0`: spend, revenue. Currency defaults to 2 decimals.
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
export function formatMetric(value, format) {
  const formatter = FORMATTERS[format];
  if (!formatter) throw new Error(`Unknown format: ${format}`);
  if (value == null || !Number.isFinite(value)) return "—";
  return formatter.format(value);
}
