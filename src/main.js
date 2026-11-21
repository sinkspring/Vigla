import "./styles.css";
import { fixture, campaigns, asOf } from "./data/fixture.js";
import { defaultView, tableOptions } from "./state/view.js";
import { buildTable } from "./domain/table.js";

const header = document.createElement("header");
const title = document.createElement("h1");
title.textContent = "Vigla";
header.append(title);

const main = document.createElement("main");
const description = document.createElement("p");
description.textContent =
  "UA dashboard for user acquisition in mobile game development";
main.append(description);

const footer = document.createElement("footer");
footer.textContent = "by dev@bykalita.dev";

document.body.append(header, main, footer);

const state = {
  rows: fixture,
  campaigns,
  asOf,
  view: structuredClone(defaultView),
};

const table = buildTable(state.rows, tableOptions(state));
