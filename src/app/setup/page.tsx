import SetupWizard from "@/components/SetupWizard";
import { hasOwner } from "@/lib/directory/bootstrap";
import { getDirectory } from "@/lib/directory/store";
import { getSettings, hostName } from "@/lib/store";
import type { LocalSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [settings, directory] = await Promise.all([getSettings(), getDirectory()]);
  return (
    <SetupRoute
      settings={settings}
      host={hostName()}
      needsClaim={!hasOwner(directory)}
    />
  );
}

function SetupRoute({
  settings,
  host,
  needsClaim,
}: {
  settings: LocalSettings;
  host: string;
  needsClaim: boolean;
}) {
  return <SetupWizard initial={settings} systemHost={host} needsClaim={needsClaim} />;
}
