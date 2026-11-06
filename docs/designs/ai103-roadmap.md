# AI-103 as a roadmap, not a coverage claim

AI-103T00 is a Microsoft Foundry course. openFoundry is an independent local
workbench, so it cannot be a one-to-one course environment: several exercises
depend on Microsoft-hosted services and tenant permissions that are not
available to everyone.

This document treats the course as a **roadmap**:

- **Local equivalent** — the concept is implemented locally with real code.
- **Alternative** — a different local or connector-based implementation is used.
- **Limitation** — the Microsoft/Foundry-specific capability has no honest local
  substitute; the course step must be done in Microsoft Foundry/Azure.

It is not a claim that AI-103 can be completed entirely in openFoundry.

## Path 1 — Develop generative AI apps

| Module | openFoundry approach | Status |
| --- | --- | --- |
| Plan and prepare an AI solution | Local setup, projects, resource settings | Local equivalent |
| Select, deploy, evaluate models | Local runtimes, OpenAI-compatible deployments, local evaluation runs | Local equivalent |
| Chat app with projects and Responses API | Local Responses API with streaming, history and `previous_response_id` | Local equivalent |
| Apps that use tools | MCP servers, HTTP tools, toolboxes and function tools | Local equivalent |
| Optimize: prompt, RAG, fine-tune | Local RAG, prompt changes, dataset export, MLX LoRA/QLoRA | Local equivalent, different trainer |
| Responsible AI | Deterministic guardrails with PII/credential strategies, an optional local-model semantic layer, and human approval for destructive tools; see `docs/designs/guardrails-real-2026-11-06/`, `docs/designs/semantic-guardrail-2026-11-06/` and `docs/designs/tool-approvals-2026-11-06/` | Alternative; not Azure Content Safety |

## Path 2 — Develop AI agents

| Module | openFoundry approach | Status |
| --- | --- | --- |
| Agents in the portal | Local agent builder, versions and playground | Local equivalent |
| Custom tools | HTTP tools and function tools | Local equivalent |
| MCP tools | Real MCP stdio/SSE/HTTP clients and server endpoints | Local equivalent |
| Foundry IQ knowledge | SQLite FTS5 + vectors + reranking + citations | Local equivalent |
| Web IQ | Project-owned web crawler | Alternative; not Bing |
| Microsoft 365 / Work IQ / SharePoint / Fabric | Work IQ and live tenant access need Microsoft 365 and admin consent. Local `sharepoint-export` and `fabric-export` connectors index exported files | Limitation, with a local export alternative |
| Agent-driven workflows | Local workflow engine | Local equivalent |
| Agent Framework SDK | Official `agent-framework` SDK against the local project | Local equivalent |
| Multi-agent orchestration | Sequential, concurrent, group-chat, handoff and Magentic builders | Local equivalent |
| A2A discovery and messaging | Agent card, JSON-RPC `message/send`, bearer auth | Local equivalent |

## Path 3 — Natural language solutions

| Module | openFoundry approach | Status |
| --- | --- | --- |
| Analyze text | Local chat model for sentiment, entities, key phrases and PII | Alternative; not Azure Language |
| Text translation | Local chat model | Alternative |
| Speech synthesis | macOS `say` | Local equivalent |
| Speech transcription | whisper.cpp with a local model | Local equivalent |
| Voice Live | Local WebSocket, VAD, barge-in, AEC | Local equivalent |
| Speech-to-speech translation | Not implemented as one endpoint | Limitation |
| Speech MCP / Language MCP | Real bearer-token MCP endpoints | Local equivalent |

## Path 4 — Extract insights from visual data

| Module | openFoundry approach | Status |
| --- | --- | --- |
| Vision-enabled chat | Image routing is implemented; needs a local vision model | Partial |
| Generate images | AUTOMATIC1111-compatible or OpenAI-compatible local runtime | Local equivalent if a runtime is installed |
| Generate videos | No local video adapter | Limitation |
| Content Understanding (image/multimodal/client) | Azure-specific | Limitation |
| Document Intelligence | `pdftotext`, tesseract OCR, tables/key-value pairs, custom extraction and MLX fine-tuning | Local equivalent |
| Knowledge mining with AI Search | Local SQLite retrieval engine | Alternative; not Azure AI Search |

## Alternatives for Microsoft-only services

- **Microsoft 365 / SharePoint:** the `sharepoint-export` connector indexes a
  folder you have already exported or synced; see
  `docs/designs/local-export-connectors-2026-11-06/`. If the tenant exposes a
  Graph or MCP endpoint, connect it as an MCP/HTTP tool. This is not a
  tenant-wide Work IQ replacement.
- **Work IQ:** no local equivalent. Local retrieval over exported content is the
  honest fallback; tenant-wide organizational knowledge requires Microsoft 365.
- **Fabric:** no local OneLake/Fabric equivalent. The `fabric-export` connector
  indexes CSV/JSON/JSONL exported from a lakehouse or warehouse; Fabric
  semantics, lineage and governance remain a limitation.
- **Azure AI Search:** the local RAG engine is a functional alternative for text
  retrieval, not a scale/feature equivalent.
- **Azure Content Safety:** local deterministic guardrails are real, and an
  optional local-model semantic layer and human approval for destructive tools
  are implemented. They are not Azure Content Safety and do not match its
  hosted classifiers.
- **Content Understanding and video generation:** no local substitute today.

## What this means

People who need the exact Microsoft-hosted exercises — especially Work IQ,
SharePoint/Fabric and Content Understanding — should do those steps in Microsoft
Foundry/Azure. openFoundry can teach and run the local equivalents for the
concepts that do not require a Microsoft tenant.

The product roadmap is therefore:

1. Keep the local equivalents real and tested.
2. Add a connector/alternative where a local substitute is honest and useful.
3. Mark tenant-gated or Microsoft-specific steps as limitations instead of
   simulating success.
