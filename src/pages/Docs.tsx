import { Link } from "react-router-dom";

export default function Docs() {
  return (
    <div className="docs-layout">
      <aside className="docs-nav" aria-label="Docs navigation">
        <div className="field-label">Contents</div>
        <a href="#overview">Overview</a>
        <a href="#providers">Providers</a>
        <a href="#models">Models</a>
        <a href="#playground">Playground</a>
        <a href="#agents">Agents</a>
        <a href="#knowledge">Knowledge</a>
        <a href="#privacy">Privacy</a>
        <a href="#roadmap">Roadmap</a>
      </aside>
      <article className="docs-content">
        <p className="docs-lead">
          openFoundry is an independent desktop workbench for running models, agents
          and knowledge bases on your own computer. It is free software and is not
          affiliated with, endorsed by, or sponsored by any model provider.
        </p>

        <h2 id="overview">Overview</h2>
        <p>
          The app discovers models from the providers you configure, keeps workspace
          data in a local folder, and never sends telemetry. There is no cloud account
          and no subscription.
        </p>
        <ul>
          <li>Desktop app built with Tauri and React.</li>
          <li>Provider-first: the app does not bundle or redistribute model weights.</li>
          <li>Workspace data is stored on your computer.</li>
          <li>No analytics, crash uploads or remote logging.</li>
        </ul>

        <h2 id="providers">Providers</h2>
        <p>
          openFoundry supports two provider shapes: Ollama&apos;s native API and any
          OpenAI-compatible endpoint. Tested targets include Ollama, LM Studio,
          llama.cpp server, Foundry CLI and custom servers.
        </p>
        <pre className="code-block">{`Ollama                 http://127.0.0.1:11434
LM Studio              http://127.0.0.1:1234
llama.cpp server       http://127.0.0.1:8080
Foundry CLI            http://127.0.0.1:50414`}</pre>
        <p>
          Configure endpoints in <Link to="/manage">Workspace settings</Link>. The app
          scans each enabled endpoint and shows exactly what it reports.
        </p>

        <h2 id="models">Models</h2>
        <p>
          Models are never invented. If a provider reports no models, the catalog is
          empty. Model weights and licenses belong to their publishers; openFoundry
          does not redistribute them.
        </p>

        <h2 id="playground">Playground</h2>
        <p>
          The playground sends streaming chat requests directly to the selected
          provider. Prompts are not routed through an openFoundry server.
        </p>

        <h2 id="agents">Agents</h2>
        <p>
          Prompt agents store a name, instructions, model and provider locally. The
          current build lets you create agents and open their model in the playground.
          Tool calling, routines and workflow orchestration are on the roadmap.
        </p>

        <h2 id="knowledge">Knowledge</h2>
        <p>
          Local document indexing and retrieval are the next runtime milestone. This
          build deliberately does not show a fake knowledge base before indexing works.
        </p>

        <h2 id="privacy">Privacy</h2>
        <p>
          Workspace metadata stays in the app data folder. Requests only leave your
          computer when you configure a remote provider or explicitly use a remote
          endpoint. See the <Link to="/privacy">privacy policy</Link>.
        </p>

        <h2 id="roadmap">Roadmap</h2>
        <ul>
          <li>Built-in llama.cpp engine installation for machines without Ollama.</li>
          <li>Local knowledge indexing and retrieval.</li>
          <li>Agent tools, guardrails and evaluation runs.</li>
          <li>Windows installer and QA.</li>
          <li>Signed macOS builds.</li>
        </ul>

        <div className="banner mt-16">
          <span>
            openFoundry is an independent learning project. It is not affiliated with any model provider or platform vendor.
          </span>
        </div>
      </article>
    </div>
  );
}
