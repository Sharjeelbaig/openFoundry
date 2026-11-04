// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { Suspense } from "react";
import Playground from "./Playground";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="page muted">Loading playground…</div>}>
      <Playground />
    </Suspense>
  );
}
