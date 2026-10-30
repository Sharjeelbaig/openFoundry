import SetupWizard from "@/components/SetupWizard";
import { getSettings, hostName } from "@/lib/store";
import type { LocalSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const settings = await getSettings();
  return <SetupRoute settings={settings} host={hostName()} />;
}

function SetupRoute({
  settings,
  host,
}: {
  settings: LocalSettings;
  host: string;
}) {
  return <SetupWizard initial={settings} systemHost={host} />;
}
