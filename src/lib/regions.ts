// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { DataZone } from "./types";

/**
 * Azure-style region / data-zone labels shared by the server (which pins a
 * runtime node to a region) and the client (which shows the picker). Kept out
 * of `nodes.ts` because that module is server-only.
 */

export const ZONE_REGION: Record<DataZone, string> = {
  US: "East US",
  EU: "West Europe",
  APAC: "Southeast Asia",
};

export const ZONES: DataZone[] = ["US", "EU", "APAC"];

/** Curated Azure region list for the Region scope. */
export const REGIONS = [
  "East US",
  "West US",
  "West US 2",
  "West Europe",
  "North Europe",
  "Sweden Central",
  "Southeast Asia",
  "East Asia",
  "Japan East",
];

export function zoneForRegion(region: string): DataZone | "Device" {
  const value = (region || "").toLowerCase();
  if (!value || value.includes("device")) return "Device";
  if (
    value.includes("europe") ||
    value.includes("sweden") ||
    value.includes("france") ||
    value.includes("uk") ||
    value.includes("germany")
  )
    return "EU";
  if (
    value.includes("asia") ||
    value.includes("japan") ||
    value.includes("korea") ||
    value.includes("australia") ||
    value.includes("india")
  )
    return "APAC";
  return "US";
}
