# Product scope — openFoundry

openFoundry is an independent, open-source local AI workbench with a
Foundry-style UI. It is not Microsoft Foundry, not a Microsoft product, and not
a cloud control plane. The UI is intentionally similar so a Foundry user can
navigate it without relearning the product; the backend is a different, local
implementation.

## What runs for real

- Local models through Foundry Local, Ollama, llama.cpp, LM Studio and MLX.
- Chat, streaming, tool calls, the OpenAI Responses API and response history.
- Agents, MCP servers, HTTP tools, toolboxes, A2A and the Microsoft Agent
  Framework SDK compatibility layer.
- Local RAG: ingestion, chunking, SQLite FTS5 + stored vectors, RRF, reranking
  and citations.
- Workflows, routines, memory and guardrails.
- Speech: macOS `say` TTS, whisper.cpp STT, Voice Live WebSocket, VAD, barge-in
  and acoustic echo cancellation.
- OCR, structured extraction and local MLX fine-tuning (0.5B, 1.5B bf16 and
  7B 4-bit QLoRA).
- Local auth/RBAC, traces, evaluations that call models, deployments with real
  OpenAI-compatible endpoints, and a shared Responses store with tenant tokens,
  quotas and audit.

## Deliberately local or approximate

These are labelled in the product rather than presented as cloud services:

- Azure-style subscriptions, resource groups, regions and projects are local
  metadata. There is no Azure Resource Manager or Entra tenant.
- The deployment layer has a real local runtime plus an explicitly simulated
  "production deployment" mode for cloud-like limits and queues. Data-residency
  scopes other than `Device` are simulated.
- Foundry IQ, Web IQ and AI Search are local equivalents, not Azure AI Search.
  Web IQ uses the project's own crawler, not Bing.
- Guardrails are deterministic regex/prompt controls, not Azure Content Safety.
- Evaluations are real model calls with local heuristics, not Azure evaluators.
- Billing is local usage accounting. No payment provider, invoice, tax or
  subscription lifecycle is configured.

## Not supported without an external prerequisite

- Microsoft 365 / Work IQ / Fabric / SharePoint: needs a Microsoft tenant and
  admin consent.
- Content Understanding and video generation: no local runtime adapter.
- Payment/invoice integration: needs a provider choice and test credentials.
- 7B bf16 and larger bf16 fine-tunes: need more memory than this 8 GB machine.

## Agent runtime decision

The Python compatibility package uses the official Microsoft **Agent Framework
1.24** SDK: `FoundryChatClient`, `FoundryAgent`, streaming, tool calls,
orchestrations and project agent versions. The portal's own workflow designer is
a separate TypeScript workflow engine.

Agent Framework already covers agents, chat clients, tools, MCP, A2A,
orchestrations, workflows with checkpoint storage, sessions, evaluation and
vector interfaces. LangChain/LangGraph are therefore **not a dependency today**.
If a future feature needs a capability Agent Framework does not expose — for
example, a specific LangChain connector or a LangGraph graph pattern — add it as
an adapter (an MCP/HTTP tool or a Python sidecar), not as a second core runtime.

The product should use the local implementation first, then Agent Framework,
then LangChain/LangGraph only for a concrete missing capability.
