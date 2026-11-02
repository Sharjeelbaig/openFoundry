import RoutineDetail from "@/components/routines/RoutineDetail";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function RoutineDetailPage({ params }: Params) {
  const { id } = await params;
  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <RoutineDetail id={id} />
    </div>
  );
}
