// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { redirect } from "next/navigation";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function WorkflowPage({ params }: Params) {
  const { id } = await params;
  redirect(`/build/agents/workflows/${encodeURIComponent(id)}/build`);
}
