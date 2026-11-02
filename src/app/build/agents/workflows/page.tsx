import AgentsHeader from "@/components/agents/AgentsHeader";
import WorkflowsList from "@/components/workflows/WorkflowsList";

export const metadata = {
  title: "Workflows · Agents · openFoundry",
};

export default function WorkflowsPage() {
  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <AgentsHeader />
      <WorkflowsList />
    </div>
  );
}
