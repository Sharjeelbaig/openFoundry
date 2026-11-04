// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import KnowledgeDetail from "./KnowledgeDetail";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KnowledgeDetail id={decodeURIComponent(id)} />;
}
