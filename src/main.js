import "./styles.css";

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
