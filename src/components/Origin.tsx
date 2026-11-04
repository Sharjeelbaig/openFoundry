// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { createContext, useContext } from "react";

/**
 * The origin the workspace is being served from, resolved once on the server
 * from the request headers. Pages used to read `window.location.origin` during
 * render and fall back to `http://localhost:3000` on the server, which made the
 * server HTML disagree with the first client render whenever the app was not on
 * port 3000 (a hydration mismatch). Reading the same value everywhere keeps the
 * endpoint samples correct and identical on both sides.
 */
const OriginContext = createContext("http://localhost:3000");

export function OriginProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return <OriginContext.Provider value={value}>{children}</OriginContext.Provider>;
}

export function useOrigin(): string {
  return useContext(OriginContext);
}
