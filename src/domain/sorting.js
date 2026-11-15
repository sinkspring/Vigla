/** Builds a comparator for `Array.prototype.sort` / `toSorted`. Numbers sort numerically,
 * strings with `localeCompare`, and null/undefined go last in both directions.
 *
 * @param {(item: Object) => number | string | null} getValue - Picks the value to sort by, e.g. `(row) => row.cells.cpi.value`
 * @param {"asc" | "desc"} [direction="asc"]
 * @returns {(a: Object, b: Object) => number} Negative if a goes first, positive if b goes first, 0 to keep order
 */
export function compareBy(getValue, direction = "asc") {
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
export function sortRows(rows, getValue, direction = "asc") {
  return rows.toSorted(compareBy(getValue, direction));
}
