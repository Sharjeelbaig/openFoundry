# Agent Framework SDK surface — 2026-11-06

The official `agent-framework` Python SDK runs against the local openFoundry
project. This required one server fix and one client helper:

1. `/api/projects/<project>/agents/<name>/versions` now authenticates with the
   project API key instead of a browser session. The Azure AI Projects SDK
   sends the key as a bearer token, and the route already checked it; the proxy
   was blocking the request first.
2. `sdk/python/openfoundry_agent_framework` supplies an
   `OpenFoundryCredential` that returns the local project key as the token the
   SDK expects, plus `create_agent`, `create_chat_client`,
   `create_project_client` and `create_foundry_agent` helpers.

## Verified surface

All runs used the official SDK packages:

- `agent-framework` 1.24.0
- `azure-ai-projects` 2.7.0
- Python 3.13

### FoundryChatClient / Agent

`chat-agent.txt`:

```
Agent Framework SDK works.
```

The agent used `FoundryChatClient` against
`http://127.0.0.1:3000/api/projects/openfoundry-lab` with the local project key
as the credential token.

### Project agent version / FoundryAgent

`full-surface.txt`:

```
AGENT_VERSION: sdk-evidence-1793940420 1 AgentVersionStatus.ACTIVE
FOUNDRY_AGENT: Hello from the Foundry Agent Service surface!
DELETED_VERSION: sdk-evidence-1793940420 1
```

The version was created through `project.agents.create_version(...,
enforce_https=False)`, run through `FoundryAgent`, and deleted afterwards. The
project surface stores the definition and serves the Responses API with
`agent_reference`.

### Streaming Responses

The project Responses API now supports `stream: true` with real SSE events from
the local chat runtime:

```
EVENTS: response.created -> response.in_progress -> response.output_item.added ->
response.content_part.added -> response.output_text.delta -> ... ->
response.output_text.done -> response.content_part.done ->
response.output_item.done -> response.completed
TEXT: stream works.
```

The official OpenAI SDK parses the stream and the Agent Framework
`agent.run(..., stream=True)` API yields text updates. `streaming.txt` records
the raw event sequence.

### Streaming tool calls

Project Responses now persists response history by `previous_response_id`, so a
tool call and its `function_call_output` follow-up share context. The stream
emits `response.output_item.added`, argument deltas/done and
`response.output_item.done` for function calls.

`streaming-tool.txt`:

```
STREAM_CHUNKS: ['The', ' code for "', 'vault" is', ' ZX-4', '417.', 'The code for "vault" is ZX-4417.']
STREAM_ANSWER: The code for "vault" is ZX-4417.The code for "vault" is ZX-4417.
```

The Agent Framework stream yields text deltas and a final full-text update; the
final duplicate is the SDK's done event, not a second model call.

### Concurrent orchestration

`orchestration-patterns.txt`:

```
CONCURRENT: Local models provide enhanced data privacy and security by keeping
information on your own hardware.Local models provide enhanced data privacy and
security because your information never leaves your own hardware.
```

`ConcurrentBuilder(participants=[alpha, beta]).build()` ran both agents and
returned the aggregated response.

### Group chat orchestration

```
GROUP_CHAT: The ocean covers more than 70% of Earth's surface. | The ocean covers
more than 70% of Earth's surface. | The group chat has reached its termination
condition.
```

A round-robin `selection_func`, `max_rounds=2`, and
`output_from="all"` produced participant outputs plus the orchestrator's
termination message.

### Handoff orchestration

```
HANDOFF: True Our billing team can help you with that.
```

The triage agent called the injected `handoff_to_billing` tool, the event stream
contained `handoff_sent`, and the billing agent produced the final answer.
Handoff agents use `require_per_service_call_history_persistence=True`, which is
required by the SDK for handoff tool-call short-circuits.

### Magentic orchestration

```
MAGENTIC: One benefit of local speech recognition is enhanced privacy, as voice
data is processed directly on the device rather than being sent to a cloud server.
```

`MagenticBuilder` used a manager agent plus a worker agent, with
`max_round_count=3` and `max_stall_count=2`.

### Sequential multi-agent orchestration

`full-surface.txt`:

```
SEQUENTIAL_OUTPUT: Local SDK compatibility prevents "works on my machine" bugs
by ensuring development environments mirror production, thereby reducing
deployment failures and integration errors.
```

Two `Agent` instances were passed to `SequentialBuilder(...).build()` and the
workflow ran through the local project.

## Integration test

`sdk/python/tests/test_live.py` is a stdlib `unittest` integration suite with
thirteen live tests. `sdk-python-tests.txt` records:

```
test_agent_streaming ... ok
test_concurrent_orchestration ... ok
test_foundry_chat_client_runs_an_agent ... ok
test_group_chat_orchestration ... ok
test_handoff_orchestration ... ok
test_magentic_orchestration ... ok
test_openai_responses_stream_events ... ok
test_project_agent_version_and_foundry_agent ... ok
test_sequential_multi_agent_orchestration ... ok
test_streaming_tool_call ... ok
test_voice_live_transport ... ok
Ran 13 tests in 50.161s
OK
```

`orchestration-patterns.txt` is the runnable
`sdk/python/examples/orchestrations.py` output for concurrent, group chat,
handoff and Magentic. `streaming.txt` is the raw OpenAI Responses stream.

Run it against a running server:

```bash
export OPENFOUNDRY_PROJECT_ENDPOINT=http://127.0.0.1:3000/api/projects/openfoundry-lab
export OPENFOUNDRY_API_KEY="<project key>"
export OPENFOUNDRY_MODEL="gemma4:31b-cloud"
PYTHONPATH=sdk/python python -m unittest -v sdk/python/tests/test_live.py
```

## Notes

- `enforce_https=False` is required per operation because Azure Core refuses
  bearer auth over plain HTTP by default. It is a loopback-only lab setting.
- The project key is read from `Manage → Project details`; no Entra tenant is
  needed for the local surface.
- Temporary agent versions created by the tests are deleted in `finally`.
