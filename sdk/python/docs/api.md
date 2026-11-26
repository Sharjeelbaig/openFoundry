# API reference

```python
from openfoundry_agent_framework import (
    DEFAULT_PROJECT_ENDPOINT,
    OpenFoundryCredential,
    create_agent,
    create_chat_client,
    create_foundry_agent,
    create_project_client,
)
```

All factory arguments are keyword-only.

---

## `DEFAULT_PROJECT_ENDPOINT`

```python
DEFAULT_PROJECT_ENDPOINT: str = "http://127.0.0.1:3000/api/projects/openfoundry-lab"
```

Used when neither `project_endpoint=` nor `OPENFOUNDRY_PROJECT_ENDPOINT` is set.

---

## `OpenFoundryCredential`

```python
OpenFoundryCredential(api_key: str | None = None)
```

An `azure.core.credentials.TokenCredential` implementation that presents the openFoundry
project API key as a bearer token. Use it anywhere the SDK accepts a credential,
including `FoundryChatClient`, `FoundryAgent` and `AIProjectClient`.

**Parameters**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `api_key` | `str \| None` | `None` | Project key. Falls back to `OPENFOUNDRY_API_KEY`. |

**Raises** `ValueError` when no key is available from either source.

**Methods**

| Method | Returns | Notes |
| --- | --- | --- |
| `get_token(*scopes, **kwargs)` | `AccessToken` | Synchronous. Expiry is one hour from the call. |
| `get_token_async(*scopes, **kwargs)` | `AccessToken` | Awaitable wrapper over `get_token`. |
| `close()` | `None` (awaitable) | No-op; present for the credential protocol. |

Scopes are ignored. openFoundry does not issue scoped tokens.

```python
from agent_framework.foundry import FoundryChatClient
from openfoundry_agent_framework import OpenFoundryCredential

client = FoundryChatClient(
    credential=OpenFoundryCredential(),
    project_endpoint="http://127.0.0.1:3000/api/projects/openfoundry-lab",
    model="gemma4:31b-cloud",
)
```

---

## `create_agent`

```python
create_agent(
    *,
    name: str,
    instructions: str,
    model: str | None = None,
    project_endpoint: str | None = None,
    api_key: str | None = None,
    **agent_options,
) -> agent_framework.Agent
```

Creates an `Agent` whose client is a `FoundryChatClient` bound to the local project. This
is the usual entry point.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| `name` | `str` | Agent name, surfaced as `Message.author_name` in orchestration output. |
| `instructions` | `str` | System instructions. |
| `model` | `str \| None` | Overrides `OPENFOUNDRY_MODEL`. |
| `project_endpoint` | `str \| None` | Overrides `OPENFOUNDRY_PROJECT_ENDPOINT`. |
| `api_key` | `str \| None` | Overrides `OPENFOUNDRY_API_KEY`. |
| `**agent_options` | `Any` | Forwarded to `Agent` unchanged. |

**Raises** `ValueError` for a missing key or model.

**Forwarded options worth knowing**

| Option | Used by |
| --- | --- |
| `require_per_service_call_history_persistence=True` | Handoff orchestration (required by the SDK for handoff tool calls) |
| `tools=[...]` | Function tools decorated with `agent_framework.tool` |

```python
agent = create_agent(
    name="greeter",
    instructions="Greet the user in one sentence.",
    tools=[get_time],
)
```

---

## `create_chat_client`

```python
create_chat_client(
    *,
    model: str | None = None,
    project_endpoint: str | None = None,
    api_key: str | None = None,
) -> agent_framework.foundry.FoundryChatClient
```

Builds the official `FoundryChatClient` pointed at openFoundry. Use it when several agents
should share one client, or when you want to call the client directly.

```python
chat_client = create_chat_client()
summarizer = chat_client.as_agent(name="summarizer", instructions="Summarize in one line.")
classifier = chat_client.as_agent(name="classifier", instructions="Reply with one word.")
```

`as_agent` is part of the Microsoft SDK, not this package.

**Raises** `ValueError` for a missing key or model.

---

## `create_project_client`

```python
create_project_client(
    *,
    project_endpoint: str | None = None,
    api_key: str | None = None,
) -> azure.ai.projects.AIProjectClient
```

Builds an `AIProjectClient` for the operations that live on the project surface: agent
versions, conversations, stored responses.

```python
project = create_project_client()
```

Notes:

- Use it as a context manager (`with create_project_client() as project:`), as the Azure
  SDK expects.
- Mutating operations need `enforce_https=False` because the endpoint is plain HTTP.
- The endpoint is passed through unchanged; do not append `/openai/v1` yourself.

---

## `create_foundry_agent`

```python
create_foundry_agent(
    *,
    agent_name: str,
    agent_version: str | None = None,
    project_endpoint: str | None = None,
    api_key: str | None = None,
    **kwargs,
) -> agent_framework.foundry.FoundryAgent
```

Connects to a prompt agent version that already exists on the project.

| Name | Type | Description |
| --- | --- | --- |
| `agent_name` | `str` | Name used when the version was created. |
| `agent_version` | `str \| None` | Pin a specific version; omit for the latest. |
| `**kwargs` | `Any` | Forwarded to `FoundryAgent`. |

```python
agent = create_foundry_agent(agent_name="local-agent")
result = await agent.run("Hello from the project agent.")
print(result.text)
```

**Raises** `ValueError` for a missing key.

---

## Errors you can catch

| Exception | Cause |
| --- | --- |
| `ValueError` | Missing `OPENFOUNDRY_API_KEY` or `OPENFOUNDRY_MODEL` |
| `azure.core.exceptions.ClientAuthenticationError` | Key rejected by the project |
| `azure.core.exceptions.ResourceNotFoundError` | Wrong project slug in the endpoint |
| `httpx.ConnectError` / `ConnectionError` | openFoundry is not running, or the port is wrong |
| `azure.core.exceptions.HttpResponseError` with `enforce_https` | Azure Core refused plain HTTP; pass `enforce_https=False` |

See [Troubleshooting](troubleshooting.md) for the full mapping.
