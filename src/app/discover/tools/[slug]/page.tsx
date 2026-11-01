import { notFound } from "next/navigation";
import catalog from "@/data/tool-catalog.json";
import setups from "@/data/tool-setup.json";
import SkillDetail from "@/components/SkillDetail";
import { ToolCatalogEntry, ToolSetup } from "@/lib/types";

interface Params {
  params: Promise<{ slug: string }>;
}

const entries = catalog as ToolCatalogEntry[];
const setupMap = setups as Record<string, ToolSetup>;

export default async function ToolDetailPage({ params }: Params) {
  const { slug } = await params;
  const entry = entries.find((item) => item.slug === slug);
  if (!entry || entry.type !== "Skills") notFound();
  return <SkillDetail entry={entry} setup={setupMap[entry.id]} />;
}
