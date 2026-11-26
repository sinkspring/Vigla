import { buildTable } from "../domain/table.js";
import { formatMetric } from "../domain/format.js";
import { tableOptions } from "../state/view.js";

const NAME_COLUMNS = [
  { key: "label", label: "Campaigns" },
  { key: "network", label: "Network" },
];

/** Header row: "Campaigns", "Network", then one sort button per column, in `columns` order.
 *
 * @param {Array<{key: string, label: string}>} columns - `table.columns`
 * @param {{column: string, direction: "asc" | "desc"}} sort - `state.view.sort`
 * @returns {HTMLTableRowElement}
 */
function renderHeader(columns, sort) {
  const tr = document.createElement("tr");

  for (const column of [...NAME_COLUMNS, ...columns]) {
    const button = document.createElement("button");
    button.dataset.key = column.key;
    button.textContent = column.label;

    const th = document.createElement("th");
    th.scope = "col";
    if (column.key === sort.column) {
      const ascending = sort.direction === "asc";
      th.setAttribute("aria-sort", ascending ? "ascending" : "descending");

      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = ascending ? " ▲" : " ▼"; // UX improvement
      button.append(arrow);
    }
    th.append(button);
    tr.append(th);
  }
  return tr;
}

/** A span for screen readers
 *
 * @param {string} text
 * @returns {HTMLSpanElement}
 */
function hiddenText(text) {
  const span = document.createElement("span");
  span.className = "visually-hidden";
  span.textContent = text;
  return span;
}

/** One table row: the label as a row header, the network, then one cell per column, in `columns` order.
 *
 * @param {{label: string, attributes: Object, cells: Object}} row - A row of `table.rows`, or `table.total`
 * @param {Array<{key: string, label: string}>} columns - `table.columns`
 * @returns {HTMLTableRowElement}
 */
function renderRow(row, columns) {
  const tr = document.createElement("tr");

  const name = document.createElement("th");
  name.scope = "row";
  name.textContent = row.label;
  // null in the total → empty cell
  const network = document.createElement("td");
  network.className = "network";
  network.textContent = row.attributes.network ?? "";
  tr.append(name, network);

  for (const column of columns) {
    const cell = row.cells[column.key];
    const td = document.createElement("td");
    td.dataset.state = cell.state;
    td.textContent = cell.text;
    if (cell.state === "partial") {
      const note = `Based on ${formatMetric(cell.coverage, "pct1")} of spend`;
      td.title = note;
      td.append(hiddenText(` (${note})`));
    }
    if (cell.state === "blank") td.append(hiddenText("Not enough data"));
    if (cell.state === "undefined") {
      td.append(hiddenText(" (not defined: nothing to divide by)"));
    }
    tr.append(td);
  }
  return tr;
}

/** The row shown if filters are too strict / incorrect.
 *
 * @param {number} width - Number of table columns the message spans
 * @returns {HTMLTableRowElement}
 */
function renderEmptyRow(width) {
  const td = document.createElement("td");
  td.colSpan = width;
  td.textContent = "No campaigns match the filters";
  td.dataset.state = "empty";

  const tr = document.createElement("tr");
  tr.append(td);
  return tr;
}

/** Renders the campaign table into `root`
 *
 * @param {Object} state - App state: `rows`, `campaigns`, `asOf`, `view`
 * @param {HTMLElement} root - Container the table goes into
 */
export function render(state, root) {
  const table = buildTable(state.rows, tableOptions(state));

  const thead = document.createElement("thead");
  thead.append(renderHeader(table.columns, state.view.sort));

  const tbody = document.createElement("tbody");
  const element = document.createElement("table");
  element.append(thead, tbody);

  // An empty total adds nothing to the message, so there is no footer
  if (table.rows.length === 0) {
    tbody.append(renderEmptyRow(NAME_COLUMNS.length + table.columns.length));
  } else {
    tbody.append(...table.rows.map((row) => renderRow(row, table.columns)));

    const tfoot = document.createElement("tfoot");
    tfoot.append(renderRow(table.total, table.columns));
    element.append(tfoot);
  }
  root.replaceChildren(element);
}
