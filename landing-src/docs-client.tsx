import "./styles.css";
import { hydrateRoot } from "react-dom/client";
import { DocsApp } from "./docs-app";

document.documentElement.dataset.js = "true";

const root = document.getElementById("root");
if (root) {
  hydrateRoot(root, <DocsApp />);
}
