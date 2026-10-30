export default function Privacy() {
  return (
    <div className="page docs-content" style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1>Privacy policy</h1>
      <p className="docs-lead">Local-first by design.</p>
      <h2>Data we collect</h2>
      <p>
        openFoundry does not collect analytics, crash reports or usage telemetry. There
        is no account and no remote sync.
      </p>
      <h2>Data stored on your computer</h2>
      <p>
        Workspace settings, agent records and (in future releases) knowledge indexes are
        stored in the app data directory. You can open that folder from Settings and
        delete it at any time.
      </p>
      <h2>Network requests</h2>
      <p>
        Requests are sent only to provider endpoints you configure, such as Ollama, LM
        Studio, llama.cpp, Foundry CLI or a custom endpoint. Those providers may have
        their own logging and retention policies.
      </p>
      <h2>No affiliation</h2>
      <p>
        openFoundry is an independent project. It is not affiliated with any model
        provider or platform vendor.
      </p>
    </div>
  );
}
