import ToolboxEditor from "@/components/tools/ToolboxEditor";

export default async function EditToolboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ToolboxEditor toolboxId={id} />;
}
