import AgentsHeader from "@/components/agents/AgentsHeader";
import RoutinesList from "@/components/routines/RoutinesList";

export const metadata = {
  title: "Routines · Agents · openFoundry",
};

export default function RoutinesPage() {
  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <AgentsHeader />
      <RoutinesList />
    </div>
  );
}
