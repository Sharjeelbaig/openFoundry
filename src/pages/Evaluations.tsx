import { ClipboardTask20Regular } from "@fluentui/react-icons";
import { EmptyState } from "../components/ui";

export default function Evaluations() {
  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Evaluations</h1>
          <p className="page-subtitle">Measure quality and safety on local models.</p>
        </div>
      </div>
      <EmptyState
        title="No evaluations found"
        description="Evaluation runs will appear here. The desktop evaluation runner is part of the next runtime milestone."
        illustration={<ClipboardTask20Regular style={{ width: 34, height: 34 }} />}
      />
    </div>
  );
}
