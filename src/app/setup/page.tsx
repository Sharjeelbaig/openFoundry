// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { cookies } from "next/headers";
import SetupWizard from "@/components/SetupWizard";
import { hasOwner } from "@/lib/directory/bootstrap";
import { getDirectory } from "@/lib/directory/store";
import { getSettings, hostName } from "@/lib/store";
import type { LocalSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [settings, directory] = await Promise.all([getSettings(), getDirectory()]);
  const theme =
    (await cookies()).get("openfoundry:theme")?.value === "light"
      ? "light"
      : "dark";
  return (
    <SetupRoute
      settings={settings}
      host={hostName()}
      needsClaim={!hasOwner(directory)}
      theme={theme}
    />
  );
}

function SetupRoute({
  settings,
  host,
  needsClaim,
  theme,
}: {
  settings: LocalSettings;
  host: string;
  needsClaim: boolean;
  theme: "dark" | "light";
}) {
  return (
    <SetupWizard initial={settings} systemHost={host} needsClaim={needsClaim} theme={theme} />
  );
}
