// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "@xyflow/react/dist/style.css";
import WorkflowDesigner from "@/components/workflows/WorkflowDesigner";

interface Params {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Workflow designer · openFoundry",
};

export default async function WorkflowDesignerPage({ params }: Params) {
  const { id } = await params;
  return <WorkflowDesigner id={id} />;
}
