import Link from "next/link";

export const metadata = {
  title: "Docs — openFoundry local mirror",
};

const SECTIONS = [
  ["overview", "Overview"],
  ["getting-started", "Getting started"],
  ["models", "Models and deployments"],
  ["agents", "Agents"],
  ["knowledge", "Knowledge and retrieval"],
  ["tools", "Tools"],
  ["gateway", "AI Gateway"],
  ["evaluations", "Evaluations"],
  ["api", "Local API"],
  ["data", "Where data lives"],
  ["limits", "Limitations"],
];

export default function DocsPage() {
  return (
    <div className="docs-layout">
      <aside className="docs-nav" aria-label="Docs navigation">
        <div className="field-label">Contents</div>
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </aside>
      <article className="docs-content">
        <p className="docs-lead">
          This is a local mirror of the openFoundry portal. It keeps the layout,
          navigation and vocabulary of the real product, but every model call, index and
          deployment runs on this computer.
        </p>

        <h2 id="overview">Overview</h2>
        <p>
          The portal is a Next.js app. It discovers models from Local runtime, Ollama and
          the Hugging Face cache, then exposes them through Foundry-shaped endpoints.
          Nothing is provisioned in a cloud account, so the UI can be explored without a
          subscription or a bill.
        </p>
        <ul>
          <li>Project identity and credentials: configure them in <Link href="/manage">Manage → Project details</Link>. They are generated and stored on this computer.</li>
          <li>The project starts empty. Agents, deployments, knowledge, datasets and evaluations exist only after you create them.</li>
          <li>Inference: whichever local runtime owns the model.</li>
          <li>Embeddings: Ollama <span className="mono">nomic-embed-text</span>, then a Foundry embedding model, then lexical scoring.</li>
          <li>Storage: JSON files under <span className="mono">data/</span>.</li>
        </ul>

        <h2 id="getting-started">Getting started</h2>
        <ol>
          <li>Start Local runtime or Ollama so at least one chat model is available.</li>
          <li>Open <Link href="/discover/models">Discover → Models</Link> and deploy a model.</li>
          <li>Create an agent in <Link href="/build/agents">Build → Agents</Link>, or use a template from <Link href="/discover/agents">Discover → Agents</Link>.</li>
          <li>Test it in the <Link href="/playground">Playground</Link> or in the agent builder chat.</li>
        </ol>
        <p>
          The first request to an uncached model can take a while. A deployment created
          for an uncached model reports <span className="mono">Creating</span> while the
          runtime downloads the weights, then flips to{" "}
          <span className="mono">Running</span>.
        </p>

        <h2 id="models">Models and deployments</h2>
        <p>
          The catalog is a live union of model aliases found in the three runtimes.
          Metadata such as context window, task and license is read from the runtime and
          is never invented. Deploying a model creates a real local OpenAI-compatible
          endpoint:
        </p>
        <pre className="code-block">{`POST /api/v1/deployments/<deployment-name>/chat/completions
Content-Type: application/json
api-key: <deployment api key>

{"messages":[{"role":"user","content":"Hello"}],"stream":false}`}</pre>
        <p>
          Deleting a deployment unloads the model from the runtime and removes the
          record. It does not delete the cached weights.
        </p>

        <h2 id="agents">Agents</h2>
        <p>
          An agent stores a model, instructions, sampling parameters, tools, knowledge
          bases and a guardrail. Publishing increments a version and records history.
          Chat requests accept an <span className="mono">agentId</span> and the server
          resolves the saved configuration:
        </p>
        <pre className="code-block">{`POST /api/chat
{"agentId":"<your-agent-id>",
 "messages":[{"role":"user","content":"What should I pack?"}]}`}</pre>
        <p>
          Agents are internal UI resources. External clients should use the authenticated
          project API below with a deployment.
        </p>
        <p>
          The builder uses <span className="mono">/api/chat</span> and receives
          server-sent events. External clients should use the authenticated per-agent
          endpoint <span className="mono">/api/v1/agents/&lt;id&gt;/chat/completions</span>{" "}
          with the agent&apos;s own key. It returns a normal chat completion by default and
          supports <span className="mono">stream: true</span>. Traces record the prompt,
          response, latency, token counts and citations.
        </p>

        <h2 id="knowledge">Knowledge and retrieval</h2>
        <p>
          A knowledge base chunks documents into 900-character windows with 140
          characters of overlap. Embeddings are produced locally. Retrieval scores every
          chunk, returns the top matches and injects them into the system prompt with
          numbered citations. Retrieval can be tested without running the model on the
          knowledge detail page.
        </p>
        <ul>
          <li>Text, Markdown, CSV, JSON and HTML are read directly.</li>
          <li>PDF extraction uses <span className="mono">pdftotext</span> if installed.</li>
          <li>If no embedding model is cached, the index reports lexical mode instead of pretending to be vector search.</li>
        </ul>

        <h2 id="tools">Tools</h2>
        <p>
          Three tools are implemented: web search, file search and calculator. Tools run
          in the server before the model call and their output is added to the system
          prompt. Web search is the only outbound request; it uses DuckDuckGo HTML
          endpoints with no key.
        </p>

        <h2 id="gateway">AI Gateway</h2>
        <p>
          The gateway is a single OpenAI-compatible endpoint with routes, a per-key
          request limit and an optional in-memory cache. Enable it in{" "}
          <Link href="/manage/gateway">Manage → AI Gateway</Link>. It forwards to a local
          deployment; it does not call a cloud gateway.
        </p>
        <pre className="code-block">{`POST /api/gateway/v1/chat/completions
api-key: <project api key>
{"messages":[{"role":"user","content":"Hello"}]}`}</pre>

        <h2 id="evaluations">Evaluations</h2>
        <p>
          Quality runs send a prompt set to a real agent or deployment and record pass
          rate, groundedness and latency. Red team runs send five adversarial prompts and
          apply a transparent refusal heuristic. Review the transcripts before drawing
          conclusions: a refusal phrase is not a safety classifier.
        </p>

        <h2 id="api">Local API</h2>
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Purpose</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["/api/models", "Discover models from all runtimes (UI)", "GET"],
                ["/api/deployments", "Manage local deployments (UI)", "GET / POST / PATCH / DELETE"],
                ["/api/v1/models", "Authenticated OpenAI-compatible model list", "GET"],
                ["/api/v1/chat/completions", "Authenticated chat against a deployment", "POST"],
                ["/api/v1/embeddings", "Authenticated embeddings from an embedding deployment", "POST"],
                ["/api/v1/deployments/<name>/chat/completions", "Authenticated deployment chat", "POST"],
                ["/api/v1/agents/<id>/chat/completions", "Authenticated per-agent chat", "POST"],
                ["/api/chat", "Agent-aware streaming chat with retrieval and tools", "POST"],
                ["/api/agents", "Agent CRUD", "GET / POST / PATCH / DELETE"],
                ["/api/knowledge", "Knowledge bases, uploads and text", "GET / POST"],
                ["/api/knowledge/search", "Retrieval test", "POST"],
                ["/api/tools/test", "Run a tool in isolation", "POST"],
                ["/api/gateway/v1/chat/completions", "Routed gateway completion", "POST"],
                ["/api/evaluations", "Quality and red team runs", "GET / POST / PATCH"],
                ["/api/users", "Local project access records", "GET / POST / PATCH / DELETE"],
                ["/api/settings", "Project identity and runtime endpoints", "GET / PATCH"],
                ["/api/export", "Download the full project bundle", "GET"],
              ].map(([endpoint, purpose, method]) => (
                <tr key={endpoint}>
                  <td className="mono text-12">{endpoint}</td>
                  <td>{purpose}</td>
                  <td className="muted">{method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="data">Where data lives</h2>
        <p>
          The authenticated <span className="mono">/api/v1</span> endpoints accept the
          project API key from Manage → Project details in either the{" "}
          <span className="mono">api-key</span> header or an{" "}
          <span className="mono">Authorization: Bearer</span> header. A deployment&apos;s own
          key also works on that deployment&apos;s endpoint. Rotating the project key
          invalidates external clients immediately.
        </p>
        <p>
          Project records are written atomically to JSON files in{" "}
          <span className="mono">data/</span>: agents, deployments, knowledge, traces,
          evaluations, routines, workflows, batch jobs, gateway configuration and
          settings. Export everything from <Link href="/build/data">Build → Data</Link>.
          Conversation memory in the agent builder is stored in browser localStorage and
          is never uploaded.
        </p>

        <h2 id="limits">Limitations</h2>
        <ul>
          <li>There is no cloud resource, subscription, quota or billing behind any page.</li>
          <li>No fine-tuning runtime is bundled; datasets can be exported for an external trainer.</li>
          <li>Guardrails are prompt instructions, not a moderation model.</li>
          <li>Local models are smaller than hosted frontier models and can hallucinate.</li>
          <li>Cloud-only features such as managed compute, private networking and cloud access control are represented as local equivalents, not emulated.</li>
        </ul>

        <div className="banner mt-16">
          <span>
            This mirror exists to learn Foundry&apos;s workflow without cloud cost. It is
            not affiliated with any platform vendor and is not a production deployment.
          </span>
        </div>
      </article>
    </div>
  );
}
