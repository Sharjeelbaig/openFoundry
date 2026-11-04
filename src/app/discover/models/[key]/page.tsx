// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import ModelDetail from "./ModelDetail";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return <ModelDetail modelKey={decodeURIComponent(key)} />;
}
