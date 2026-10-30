import { Suspense } from "react";
import Catalog from "./Catalog";

export const dynamic = "force-dynamic";

export default function ModelsPage() {
  return (
    <Suspense fallback={<div className="page muted">Discovering models…</div>}>
      <Catalog />
    </Suspense>
  );
}
