import { Link } from "react-router-dom";
import { Book20Regular, Info20Regular, Settings20Regular } from "@fluentui/react-icons";

export default function Knowledge() {
  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Knowledge</h1>
          <p className="page-subtitle">
            Ground agents in documents stored on this computer.
          </p>
        </div>
      </div>

      <div className="empty" style={{ paddingTop: 56 }}>
        <Book20Regular style={{ width: 34, height: 34 }} />
        <h2>No knowledge bases yet</h2>
        <p>
          Local indexing and retrieval are being wired into the new desktop runtime.
          Your workspace already has a data directory ready for documents.
        </p>
        <div className="banner mt-16" style={{ maxWidth: 620 }}>
          <Info20Regular />
          <span>
            This first desktop build focuses on provider setup, model discovery,
            playground chat and prompt agents. Knowledge indexing is the next milestone.
          </span>
        </div>
        <div className="row mt-12" style={{ gap: 8 }}>
          <Link to="/docs#knowledge" className="btn btn-secondary">
            Read the plan
          </Link>
          <Link to="/manage" className="btn btn-secondary">
            <Settings20Regular /> Workspace settings
          </Link>
        </div>
      </div>
    </div>
  );
}
