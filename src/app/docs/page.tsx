// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import Link from "next/link";
import { DEPLOYMENT_TYPES } from "@/lib/deployment-types";

export const metadata = {
  title: "Docs — openFoundry local mirror",
};

const SECTIONS = [
  ["overview", "Overview"],
  ["getting-started", "Getting started"],
  ["setup", "Setup and runtimes"],
  ["cli", "Command line"],
  ["models", "Models and deployments"],
  ["deployment-types", "Deployment types"],
  ["runtime-nodes", "Runtime nodes"],
  ["agents", "Agents"],
  ["knowledge", "Knowledge and retrieval"],
  ["memory", "Memory"],
  ["guardrails", "Guardrails"],
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
          navigation and vocabulary of the real product. Workspace data is stored on
          this computer; model calls go to whichever provider endpoint you configure,
          which is a local runtime unless you add a remote one.
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
          <li>Agents, deployments, knowledge bases, datasets and evaluations exist only after you create them. Three guardrails (Default, DefaultV2, MAIDefault) and a Profanity blocklist are seeded on first run, so guardrails are the one section that is not empty.</li>
          <li>Inference: whichever local runtime owns the model.</li>
          <li>Embeddings: an Ollama embedding model (<span className="mono">nomic-embed-text</span> preferred), then a Foundry embedding model, then lexical scoring.</li>
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

        <h2 id="setup">Setup and runtimes</h2>
        <p>
          First launch opens a five-step wizard: Welcome, Profile, Providers, Model, Ready.
          The Providers step scans for Foundry Local, Ollama, LM Studio and llama.cpp. Only
          llama.cpp can be installed end to end from here, because it needs no account and
          publishes standalone server builds. Install downloads the matching build from the
          llama.cpp GitHub releases plus a Qwen2.5 0.5B Instruct starting model, then starts{" "}
          <span className="mono">llama-server</span> on the configured port.
        </p>
        <ul>
          <li>Downloads show live progress and can be cancelled; a finished download is reused on retry.</li>
          <li>The server can be started, stopped and removed from the same step. Removing it deletes the managed binary and model, not your workspace data.</li>
          <li>Ollama, LM Studio and Foundry Local keep their own installers. The wizard reports their real state and links to the official download instead of faking a one-click install.</li>
          <li>The managed runtime lives under <span className="mono">data/runtimes/llama.cpp</span> and the starter model under <span className="mono">data/models/llama.cpp</span>. The default endpoint is <span className="mono">http://127.0.0.1:8080</span>.</li>
          <li>Raw endpoint fields stay behind a disclosure for people who already run a server elsewhere. A non-loopback endpoint is reported as unmanaged.</li>
        </ul>
        <p>
          The profile, project identity and terms are stored in{" "}
          <span className="mono">data/settings.json</span>. The desktop shell signs itself in
          with a machine credential in the app data folder; the web build prints a one-time
          setup token to the terminal.
        </p>

        <h2 id="cli">Command line</h2>
        <p>
          Both desktop builds ship an <span className="mono">openFoundry</span> command that
          reads the same <span className="mono">directory.json</span> as the server. macOS
          links it into <span className="mono">/usr/local/bin</span> or{" "}
          <span className="mono">~/.local/bin</span> on first launch. The Windows installer
          puts it on the machine <span className="mono">PATH</span>. Open a new terminal after
          installing.
        </p>
        <pre className="code-block">{`openFoundry access-code                 # mint a code, replacing the old one
openFoundry access-code --email you@example.com
openFoundry access-code list            # every code and its state
openFoundry access-code revoke          # revoke codes and sign out sessions
openFoundry status                      # data directory, owners, sessions`}</pre>
        <p>
          It is a recovery tool, not a remote reset: it needs the same filesystem access the
          server already has. Web installs keep using{" "}
          <span className="mono">npm run access-code</span>. On macOS the data directory is{" "}
          <span className="mono">~/Library/Application Support/app.openfoundry.desktop/data</span>;
          on Windows it is <span className="mono">%APPDATA%\app.openfoundry.desktop\data</span>.
        </p>

        <h2 id="models">Models and deployments</h2>
        <p>
          The catalog is a live union of the models the configured runtimes report (Foundry
          Local, Ollama, LM Studio, llama.cpp) plus the Foundry Local CLI catalog and the
          Hugging Face catalog. Metadata such as context window, task and license is read
          from the runtime or the catalog entry and is never invented. Deploying a model
          creates a real local OpenAI-compatible endpoint:
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
          <li>The project Responses surface supports <span className="mono">stream: true</span> with OpenAI Responses SSE events.</li>
          <li>Function tools come from the agent definition, as they do in Foundry.</li>
          <li>The deployment name resolves to a local deployment or a model the runtime reports.</li>
        </ul>

        <h3 id="agent-framework">Microsoft Agent Framework SDK</h3>
        <p>
          The official <span className="mono">agent-framework</span> Python SDK can
          use this project. The repository includes a small helper package at{" "}
          <span className="mono">sdk/python</span> that presents the project API key
          as the bearer token the SDK expects:
        </p>
        <pre className="code-block">{`from openfoundry_agent_framework import create_agent

agent = create_agent(
    name="LocalAgent",
    instructions="Answer in one short sentence.",
)
result = await agent.run("What is the Agent Framework SDK?")
print(result.text)`}</pre>
        <p>
          <span className="mono">FoundryChatClient</span>,{" "}
          <span className="mono">FoundryAgent</span> against a project agent version,
          and the <span className="mono">Sequential</span>,{" "}
          <span className="mono">Concurrent</span>,{" "}
          <span className="mono">GroupChat</span>,{" "}
          <span className="mono">Handoff</span> and{" "}
          <span className="mono">Magentic</span> orchestration builders all run
          against the local project. Streaming supports function calls, including
          a tool result passed back through <span className="mono">previous_response_id</span>;
          response history is stored in SQLite and survives a server restart. Pass{" "}
          <span className="mono">enforce_https=False</span> to per-operation calls
          on the loopback HTTP endpoint, and create versions with the project key.
        </p>
        <pre className="code-block">{`from azure.ai.projects.models import PromptAgentDefinition
from openfoundry_agent_framework import create_project_client

project = create_project_client()
version = project.agents.create_version(
    agent_name="local-agent",
    definition=PromptAgentDefinition(
        model="<deployment>",
        instructions="Answer briefly.",
    ),
    enforce_https=False,
)`}</pre>

        <h2 id="knowledge">Knowledge and retrieval</h2>
        <p>
          A knowledge base chunks documents into 900-character windows with 140
          characters of overlap. Embeddings are produced locally. Retrieval scores every
          chunk, returns the top matches and injects them into the system prompt with
          numbered citations. Retrieval can be tested without running the model on the
          knowledge detail page.
        </p>
        <h3>Foundry IQ</h3>
        <p>
          Knowledge bases are created as Foundry IQ bases. A base records the chat
          completions model used to plan retrieval, a retrieval reasoning effort, an
          output mode and optional retrieval instructions, plus one or more knowledge
          sources. Reasoning effort is applied by the local query planner:
        </p>
        <ul>
          <li><span className="mono">Minimal</span> searches the raw query with no planning, for the lowest cost and latency.</li>
          <li><span className="mono">Low</span> runs one pass of planning and drops stop words to widen the search.</li>
          <li><span className="mono">Medium</span> splits the question into focused sub-queries, merges the results and refines once against the original question.</li>
        </ul>
        <p>
          Output mode selects between <span className="mono">Answer synthesis</span> (a
          grounded natural-language answer) and <span className="mono">Extractive data</span>{" "}
          (the raw retrieved chunks). Knowledge sources cover files you upload, Web, Azure
          Blob Storage, Azure AI Search indexes, Work IQ and Fabric IQ. Uploads are the only
          source that is indexed for real locally; the other kinds record the connection and
          appear in the Knowledge → Indexes tab.
        </p>
        <ul>
          <li>Text, Markdown, CSV, JSON and HTML are read directly.</li>
          <li>PDF extraction uses <span className="mono">pdftotext</span> if installed.</li>
          <li>Uploads need an embedding model: Ollama with <span className="mono">nomic-embed-text</span>, or a Foundry embedding model. Without one the upload fails with a clear error rather than indexing half a document.</li>
          <li>A base that has no vectors (an imported or legacy one) is searched lexically instead of pretending to be vector search.</li>
        </ul>

        <h2 id="memory">Memory</h2>
        <p>
          A memory store retains context across conversations. Point an agent at a store in
          the builder&apos;s Memory section and every turn is remembered and recalled. Stores
          live in <span className="mono">data/memory.json</span> on this computer; nothing is
          uploaded. Each store has a chat model, an embedding model and three feature
          switches: chat summary, procedural memory and user profile. Memories are written by
          a local heuristic extractor, not a hosted extraction service:
        </p>
        <ul>
          <li><strong>Chat summary</strong> records a one-line summary of the latest turn.</li>
          <li><strong>Procedural memory</strong> captures standing instructions such as &quot;always cite sources&quot;.</li>
          <li><strong>User profile</strong> captures durable facts about the user — name, role, dietary needs and similar.</li>
        </ul>
        <p>
          Recalled items are ranked against the incoming message and injected into the system
          prompt, so an agent can answer &quot;where do I work?&quot; from memory. Expand a store
          to see and forget individual memories. A default time-to-live expires items after a
          fixed number of seconds; zero means they never expire.
        </p>

        <h2 id="guardrails">Guardrails</h2>
        <p>
          Guardrails group controls and apply them to specific agents or models. Open a
          control group in the creation wizard to toggle controls and pick an action
          (<span className="mono">Block</span>, <span className="mono">On</span> or{" "}
          <span className="mono">Off</span>). Three built-in guardrails are seeded —{" "}
          <span className="mono">Default</span>, <span className="mono">DefaultV2</span> and{" "}
          <span className="mono">MAIDefault</span> — and a{" "}
          <span className="mono">Profanity</span> blocklist is preloaded. Controls cover
          jailbreak, network egress rules, indirect prompt injections and spotlighting,
          content harms (hate, sexual, self-harm, violence) with blocklists, protected
          materials, sensitive data leakage and task drift.
        </p>
        <p>
          Attach a guardrail to an agent or deployment in the builder. Input is checked before
          the model call and output before the answer is returned. The check is a deterministic
          classifier plus prompt instructions, so it is inspectable and adds under a millisecond
          of latency — it is not a hosted moderation model. Blocked turns return a clear refusal
          and are recorded in the trace with the control that fired.
        </p>

        <h2 id="tools">Tools</h2>
        <p>
          Agents, toolboxes and the playground can use three built-in tools:{" "}
          <span className="mono">web-search</span>, <span className="mono">file-search</span>{" "}
          and <span className="mono">calculator</span>. Web search and calculator results are
          resolved before the model call and added to the system prompt. Attached knowledge
          bases are also retrieved automatically on every turn; when{" "}
          <span className="mono">file-search</span> is enabled as well, the model gets a{" "}
          <span className="mono">file_search</span> function it can call for a second pass.
          Beyond the built-ins, a toolbox can hold MCP servers (stdio or HTTP), HTTP tools
          with templated URLs and headers, and local skills from the catalog. Nested
          toolboxes are rejected.
        </p>
        <p>
          Built-in web search uses DuckDuckGo HTML endpoints with no key. It is not the only
          outbound path: MCP servers, HTTP tools, image providers and any remote model
          endpoint you configure also leave the machine. Tools marked write or destructive
          require approval when the approval policy is on, and MCP annotations decide that
          classification where the server provides them.
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
                ["/api/extract/structured", "Tables and key/value pairs from PDFs, images or text", "POST"],
                ["/api/extraction", "Custom extraction models, examples and training", "GET / POST"],
                ["/api/extraction/extract", "Extract custom fields from text, PDFs or images", "POST"],
                ["/api/extraction/foundation", "MLX fine-tune runtime status", "GET"],
                ["/api/extraction/foundation/train", "Train and fuse a local LoRA adapter with held-out metrics", "POST"],
                ["/api/extraction/foundation/setup", "Create the MLX venv and install mlx-lm", "POST"],
                ["/api/voice/live", "Voice Live turn: local STT, agent answer and TTS over SSE", "POST"],
                ["/api/voice/live/token", "Issue a short-lived token for the Voice Live WebSocket", "POST"],
                ["ws://127.0.0.1:3002", "Full-duplex Voice Live: PCM, VAD, barge-in, server AEC", "WebSocket"],
                ["/.well-known/agent-card.json", "A2A agent-card discovery (optional ?agent=<id>)", "GET"],
                ["/api/a2a", "A2A JSON-RPC endpoint: message/send, SendMessage", "POST"],
                ["/api/a2a/token", "Issue a bearer token for the A2A endpoint", "POST"],
                ["/api/language/mcp", "Language MCP server: analyze_text, translate_text", "POST"],
                ["/api/language/mcp/token", "Issue a bearer token for the language MCP server", "POST"],
                ["/api/speech/mcp", "Speech MCP server: synthesize_speech, transcribe_audio, speech_status", "POST"],
                ["/api/speech/mcp/token", "Issue a bearer token for the speech MCP server", "POST"],
                ["/api/speech/setup", "Check, install and model-download whisper.cpp for STT", "GET / POST"],
                ["/api/memory", "Memory stores and remembered items", "GET / POST"],
                ["/api/guardrails", "Guardrails, blocklists and controls", "GET / POST"],
                ["/api/connections", "Project connections used by Foundry IQ sources", "GET / POST"],
                ["/api/tools/test", "Run a tool in isolation", "POST"],
                ["/api/toolboxes", "Toolboxes: built-ins, MCP servers and HTTP tools", "GET / POST"],
                ["/api/toolboxes/<id>/call", "Run a toolbox definition in isolation", "POST"],
                ["/api/mcp", "Registered MCP servers", "GET / POST"],
                ["/api/http-tools", "Registered HTTP tools", "GET / POST"],
                ["/api/skills", "Local skill catalog entries attached to agents", "GET / POST"],
                ["/api/images/generate", "Generate an image with the configured provider", "POST"],
                ["/api/speech/synthesize", "Local text to speech", "POST"],
                ["/api/speech/transcribe", "Local speech to text", "POST"],
                ["/api/fine-tune", "Fine-tune datasets built from traces", "GET / POST / DELETE"],
                ["/api/fine-tune/<id>/export", "Export a dataset as JSONL", "GET"],
                ["/api/workflows", "Workflow definitions and runs", "GET / POST"],
                ["/api/routines", "Scheduled routines", "GET / POST"],
                ["/api/batch", "Asynchronous batch jobs", "GET / POST / PATCH"],
                ["/api/traces", "Recorded turns for traces and datasets", "GET"],
                ["/api/tool-approvals", "Pending tool approvals and the approval policy", "GET"],
                ["/api/nodes", "Runtime nodes used by deployment routing", "GET / POST / DELETE"],
                ["/api/system", "Machine, runtime and storage status", "GET"],
                ["/api/gateway/v1/chat/completions", "Routed gateway completion", "POST"],
                ["/api/evaluations", "Quality and red team runs", "GET / POST / PATCH"],
                ["/api/directory/principals", "Local directory principals and their roles", "GET / POST / PATCH"],
                ["/api/settings", "Project identity and runtime endpoints", "GET / PATCH"],
                ["/api/responses/retention", "Responses history retention policy and owner stats", "GET / POST"],
                ["/api/responses/store/<action>", "Per-tenant shared Responses store: save, load, prune, stats, policy, audit (bearer token)", "GET / POST"],
                ["/api/responses/tenants", "Tenant registry, usage and quotas for the shared store", "GET / POST"],
                ["/api/responses/tenants/<tenant>", "Update quotas, rotate token, disable or delete a tenant", "GET / PATCH / DELETE"],
                ["/api/responses/tenants/audit", "Admin audit stream across tenants", "GET"],
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
          <span className="mono">data/</span>: agents, deployments, knowledge, memory,
          guardrails, connections, traces, evaluations, routines, workflows, batch jobs,
          gateway configuration and settings. Installed runtimes and downloaded weights live
          under <span className="mono">data/runtimes</span> and{" "}
          <span className="mono">data/models</span>. Export everything from{" "}
          <Link href="/build/data">Build → Data</Link>. Memory extracted by the agent
          builder is stored on this computer in{" "}
          <span className="mono">data/memory.json</span> and is never uploaded.
        </p>

        <h2 id="limits">Limitations</h2>
        <ul>
          <li>There is no cloud resource, subscription, quota or billing behind any page. Local serving behaviour (metering, rate limits, reserved slots, queues, batch) is real; only data residency is simulated.</li>
          <li>Chat-model fine-tuning is not bundled. Build → Fine-tune manages datasets sourced from traces and exports JSONL for an external trainer. Custom extraction can train a real local MLX LoRA adapter on macOS from the extraction page.</li>
          <li>Guardrails combine a deterministic local classifier with prompt instructions; they are not a hosted moderation model. Hosted-agent-only controls such as network egress rules are recorded but not enforced against local models.</li>
          <li>The project Responses surface and chat completions both support streaming.</li>
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
