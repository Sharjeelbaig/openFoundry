// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { renderToStaticMarkup, renderToString } from "react-dom/server";
import {
  RendererProvider,
  SSRProvider,
  createDOMRenderer,
  renderToStyleElements,
} from "@fluentui/react-components";
import { DocsApp } from "./docs-app";

export function renderDocs() {
  const renderer = createDOMRenderer();
  const html = renderToString(
    <RendererProvider renderer={renderer}>
      <SSRProvider>
        <DocsApp />
      </SSRProvider>
    </RendererProvider>
  );
  const styles = renderToStaticMarkup(<>{renderToStyleElements(renderer)}</>);
  return { html, styles };
}
