// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { renderToStaticMarkup, renderToString } from "react-dom/server";
import {
  RendererProvider,
  SSRProvider,
  createDOMRenderer,
  renderToStyleElements,
} from "@fluentui/react-components";
import { App } from "./app";

export function render() {
  const renderer = createDOMRenderer();
  const html = renderToString(
    <RendererProvider renderer={renderer}>
      <SSRProvider>
        <App />
      </SSRProvider>
    </RendererProvider>
  );
  const styles = renderToStaticMarkup(<>{renderToStyleElements(renderer)}</>);
  return { html, styles };
}
