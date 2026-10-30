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
