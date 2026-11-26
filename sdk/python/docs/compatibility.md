# Compatibility

openFoundry is an independent local workbench, not a Microsoft Foundry environment. This
page states exactly what the package covers.

## Credential and endpoint mapping

| | Microsoft Foundry | openFoundry |
| --- | --- | --- |
| Credential | `AzureCliCredential`, `DefaultAzureCredential`, managed identity | `OpenFoundryCredential` (project key) |
| Authorization header | Entra bearer token | Project key as bearer token |
| Scope | `https://ai.azure.com/.default` | Ignored |
| Endpoint | `https://<resource>.services.ai.azure.com/api/projects/<project>` | `http://127.0.0.1:<port>/api/projects/<project>` |
| Transport | HTTPS enforced | Loopback HTTP, `enforce_https=False` for project operations |
| Tenant / RBAC | Required | Not involved |
| Model | Hosted deployment | A model your local runtime serves |

## SDK surface

| Surface | Status | Notes |
| --- | --- | --- |
| `FoundryChatClient` | Works | The main path |
| `Agent` / `chat_client.as_agent` | Works | |
| `FoundryAgent` against an agent version | Works | |
| Project agent versions | Works | Needs `enforce_https=False` |
| Conversations | Works | |
| Responses API, including `previous_response_id` | Works | |
| Streaming | Works | Including function-call streaming, given a tool-capable model |
| Function tools | Works | |
| Sequential orchestration | Works | |
| Concurrent orchestration | Works | |
| Group chat orchestration | Works | |
| Handoff orchestration | Works | Requires `require_per_service_call_history_persistence=True` |
| Magentic orchestration | Works | |
| Voice Live transport | Works in openFoundry | SDK-side preview coverage varies |

The repository's live suite (`sdk/python/tests/test_live.py`) exercises these surfaces
against a running server, including streaming and tool calls.

## Version requirements

| Component | Requirement |
| --- | --- |
| Python | `>=3.11`; 3.13 tested |
| `agent-framework` | `>=1.24.0` |
| `azure-ai-projects` | `>=2.0.0` |

Python 3.14+ is not supported by some transitive dependencies yet.

## What does not map

Nothing below has a local equivalent. Do the Microsoft-hosted step in Azure if you need
it:

- Work IQ, Microsoft 365, SharePoint, OneDrive and Fabric tenant access.
- Azure AI Search as a retrieval backend.
- Azure Content Safety classifiers (openFoundry has its own guardrails).
- Content Understanding, document/video understanding services.
- Hosted model catalogue and hosted fine-tuning.
- Entra identities, managed identities, RBAC and Conditional Access.

openFoundry offers local or export-based alternatives for some of these (local retrieval,
exported-SharePoint connectors, local guardrails, MLX fine-tuning), but they are
alternatives, not equivalents.

## Statement of independence

openFoundry and this package are not affiliated with, endorsed by, or sponsored by
Microsoft or any model provider. "Microsoft Agent Framework" is a Microsoft product; this
package is an adapter that lets its official Python SDK talk to a local project.
