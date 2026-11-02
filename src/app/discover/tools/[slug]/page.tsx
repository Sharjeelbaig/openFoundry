import { notFound } from "next/navigation";
import type { Metadata } from "next";
import catalog from "@/data/tool-catalog.json";
import setups from "@/data/tool-setup.json";
import SkillDetail from "@/components/SkillDetail";
import ToolProfile from "@/components/ToolProfile";
import { ToolCatalogEntry, ToolSetup } from "@/lib/types";

interface Params {
  params: Promise<{ slug: string }>;
}

const entries = catalog as ToolCatalogEntry[];
const setupMap = setups as Record<string, ToolSetup>;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const entry = entries.find((item) => item.slug === slug);
  if (!entry) return { title: "Tool not found · openFoundry" };
  return {
    title: `${entry.name} · Tools · openFoundry`,
    description: entry.summary,
  };
}

export default async function ToolDetailPage({ params }: Params) {
  const { slug } = await params;
  const entry = entries.find((item) => item.slug === slug);
  if (!entry) notFound();
  const setup = setupMap[entry.id] ?? null;
  if (entry.type === "Skills") return <SkillDetail entry={entry} setup={setup} />;
  return <ToolProfile entry={entry} setup={setup} />;
}
