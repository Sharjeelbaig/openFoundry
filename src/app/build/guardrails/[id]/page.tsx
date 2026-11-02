import GuardrailDetail from "./GuardrailDetail";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function GuardrailDetailPage({ params }: Params) {
  const { id } = await params;
  return <GuardrailDetail id={id} />;
}
