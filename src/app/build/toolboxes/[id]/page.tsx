// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import ToolboxEditor from "@/components/tools/ToolboxEditor";

export default async function EditToolboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ToolboxEditor toolboxId={id} />;
}
