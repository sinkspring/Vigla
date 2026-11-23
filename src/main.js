import "./styles.css";
import { fixture, campaigns, asOf } from "./data/fixture.js";
import { defaultView } from "./state/view.js";
import { render } from "./ui/render.js";

const state = {
  rows: fixture,
  campaigns,
  asOf,
  view: structuredClone(defaultView),
};

const table = document.querySelector("#mainContainer");

render(state, table);
