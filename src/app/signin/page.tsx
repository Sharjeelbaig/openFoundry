// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import SignInForm from "@/components/SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <SignInForm next={next || "/"} />;
}
