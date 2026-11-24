import { buildTable } from "../domain/table.js";
import { formatMetric } from "../domain/format.js";
import { tableOptions } from "../state/view.js";

/** Header row: "Campaigns", "Network", then one sort button per column, in `columns` order.
 *
 * @param {Array<{key: string, label: string}>} columns - `table.columns`
 * @returns {HTMLTableRowElement}
 */
function renderHeader(columns) {
  const tr = document.createElement("tr");
  const nameColumns = [
    { key: "label", label: "Campaigns" },
    { key: "network", label: "Network" },
  ];

  for (const column of [...nameColumns, ...columns]) {
    const button = document.createElement("button");
    button.dataset.key = column.key;
    button.textContent = column.label;

    const th = document.createElement("th");
    th.scope = "col";
    th.append(button);
    tr.append(th);
  }
  return tr;
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
      td.title = `Based on ${formatMetric(cell.coverage, "pct1")} of spend`;
    }
    tr.append(td);
  }
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
  thead.append(renderHeader(table.columns));

  const tbody = document.createElement("tbody");
  tbody.append(...table.rows.map((row) => renderRow(row, table.columns)));

  const tfoot = document.createElement("tfoot");
  tfoot.append(renderRow(table.total, table.columns));

  const element = document.createElement("table");
  element.append(thead, tbody, tfoot);
  root.replaceChildren(element);
}
