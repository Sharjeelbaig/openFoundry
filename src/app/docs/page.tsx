import Link from "next/link";
import { DEPLOYMENT_TYPES } from "@/lib/deployment-types";

export const metadata = {
  title: "Docs — openFoundry local mirror",
};

const SECTIONS = [
  ["overview", "Overview"],
  ["getting-started", "Getting started"],
  ["models", "Models and deployments"],
  ["deployment-types", "Deployment types"],
  ["runtime-nodes", "Runtime nodes"],
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

        <h3 id="deployment-types">Deployment types</h3>
        <p>
          The <span className="mono">Deployment type</span> field uses Microsoft
          Foundry&apos;s own SKU labels, and the deployments table shows the same value.
          The Serverless, Managed compute and Adapter tabs follow Foundry&apos;s sections.
          Foundry&apos;s SKUs glue three separate ideas together; openFoundry keeps them
          apart so the parts that can be real on one computer are real:
        </p>
        <ul>
          <li>
            <strong>Serving mode</strong> — how a request is served, enforced locally.
            Standard and Developer metering with a tokens-per-minute rate limit (429 +
            <span className="mono"> Retry-After</span> when exceeded); Provisioned and
            Dedicated reserve concurrency slots with a measured queue; Batch accepts only
            asynchronous jobs; Developer is gated to evaluation.
          </li>
          <li>
            <strong>Scope</strong> — where a request is routed. Global may use any online
            runtime node, Data Zone only nodes tagged for a zone, Region is pinned to one
            node, and Device is this computer. Routing is real; the data-residency
            guarantee is the one part that stays simulated.
          </li>
          <li>
            <strong>Billing</strong> — always $0 locally. Token counts are real; any
            Azure-equivalent figure is clearly an estimate.
          </li>
        </ul>
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Deployment type</th>
                <th>Serving mode</th>
                <th>Scope</th>
                <th>Foundry option</th>
                <th>Section</th>
              </tr>
            </thead>
            <tbody>
              {DEPLOYMENT_TYPES.map((type) => (
                <tr key={type.label}>
                  <td>
                    {type.label}
                    {!type.available && <span className="muted"> · unavailable</span>}
                  </td>
                  <td className="muted">{type.servingMode}</td>
                  <td className="muted">{type.scope}</td>
                  <td className="muted">{type.option}</td>
                  <td className="muted">{type.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Types that need infrastructure this computer cannot provide (Arc, VM Managed
          Compute, Provisioned Throughput Classic) are disabled in the deploy dialog with
          the reason shown. <span className="mono">Local Provisioned Throughput</span> is
          the default and describes the instant local runtime.
        </p>

        <h3 id="runtime-nodes">Runtime nodes</h3>
        <p>
          A runtime node is a separate runtime endpoint with a region and zone label.
          Build → Models → <span className="mono">Runtime nodes</span> lists them. When you
          deploy a Regional or Data Zone type, openFoundry starts an isolated Ollama daemon
          for that region on its own port — sharing the model cache, so nothing is
          re-downloaded — and pins the deployment to it. Global deployments route across
          every online node. Foundry Local, LM Studio and llama.cpp are single servers, so
          their deployments keep the region label but use their one endpoint.
        </p>
        <p>
          Provisioned deployments accept a fixed number of concurrent requests. Requests
          beyond that wait in a queue, and if the queue cannot be served within 30 seconds
          the request is rejected with <span className="mono">429</span>, mirroring a PTU
          deployment running out of throughput.
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

        <h3 id="foundry-sdk">Running azure-ai-projects labs</h3>
        <p>
          The project surface uses Foundry&apos;s path shape:
          <span className="mono">/api/projects/&lt;project&gt;</span>. The Azure SDK appends{" "}
          <span className="mono">/openai/v1</span> itself, so point{" "}
          <span className="mono">AIProjectClient</span> at the project endpoint and leave
          the rest of the lab alone:
        </p>
        <pre className="code-block">{`from azure.ai.projects import AIProjectClient
from local_auth import ApiKeyCredential

with AIProjectClient(
    endpoint="http://127.0.0.1:3001/api/projects/openfoundry-lab",
    credential=ApiKeyCredential("<project api key>"),
) as project:
    agent = project.agents.create_version(
        agent_name="astronomy-agent",
        definition={"kind": "prompt", "model": "<deployment>", "instructions": "..."},
        enforce_https=False,
    )`}</pre>
        <p>
          <span className="mono">AIProjectClient</span> only accepts a{" "}
          <span className="mono">TokenCredential</span>, so the lab wraps the project key
          in a small bearer-token shim. <span className="mono">enforce_https=False</span>{" "}
          is the SDK&apos;s supported opt-out for a loopback HTTP endpoint. Agent
          versions, conversations, Responses with function tools and agent deletion are
          served locally.
        </p>
        <ul>
          <li>Responses are non-streaming on the project surface.</li>
          <li>Function tools come from the agent definition, as they do in Foundry.</li>
          <li>The deployment name resolves to a local deployment or a model the runtime reports.</li>
        </ul>

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
                ["/api/projects/<project>/openai/v1/responses", "Foundry Responses API for agent runs", "POST"],
                ["/api/projects/<project>/openai/v1/conversations", "Create or list conversations", "GET / POST"],
                ["/api/projects/<project>/openai/v1/conversations/<id>/items", "Append or list conversation items", "GET / POST"],
                ["/api/projects/<project>/openai/v1/models", "Models reachable from this project", "GET"],
                ["/api/projects/<project>/openai/v1/chat/completions", "Project-scoped chat completions", "POST"],
                ["/api/projects/<project>/agents/<name>/versions", "Create or list agent versions", "GET / POST"],
                ["/api/projects/<project>/agents/<name>/versions/<version>", "Get or delete an agent version", "GET / DELETE"],
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
          <li>There is no cloud resource, subscription, quota or billing behind any page. Local serving behaviour (metering, rate limits, reserved slots, queues, batch) is real; only data residency is simulated.</li>
          <li>No fine-tuning runtime is bundled; datasets can be exported for an external trainer.</li>
          <li>Guardrails are prompt instructions, not a moderation model.</li>
          <li>The project Responses surface is non-streaming; chat completions support streaming.</li>
          <li>Local models are smaller than hosted frontier models and can hallucinate.</li>
          <li>Deployment types that need Azure-only infrastructure (Arc, VM Managed Compute, Provisioned Throughput Classic) are disabled with an explanation; register a runtime node to approximate Arc or VM compute against another machine.</li>
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
