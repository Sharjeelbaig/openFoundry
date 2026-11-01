import "./styles.css";
import { hydrateRoot } from "react-dom/client";
import { App } from "./app";

document.documentElement.dataset.js = "true";

const root = document.getElementById("root");
if (root) {
  hydrateRoot(root, <App />);
}
