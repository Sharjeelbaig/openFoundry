# Configuration

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `OPENFOUNDRY_API_KEY` | yes | — | From **Manage → Project details**. Sent as `Authorization: Bearer <key>`. |
| `OPENFOUNDRY_MODEL` | yes | — | A deployment name or a model id openFoundry can resolve. |
| `OPENFOUNDRY_PROJECT_ENDPOINT` | no | `http://127.0.0.1:3000/api/projects/openfoundry-lab` | Trailing slashes are stripped. |

`create_agent` and `create_chat_client` raise `ValueError` immediately when the key or
model is missing:

```text
ValueError: Set OPENFOUNDRY_API_KEY (Manage → Project details) or pass api_key.
ValueError: Set OPENFOUNDRY_MODEL or pass model.
```

## Precedence

1. Explicit keyword argument (`model=`, `project_endpoint=`, `api_key=`).
2. Environment variable.
3. Built-in default (`DEFAULT_PROJECT_ENDPOINT`, endpoint only).

This lets one process talk to several projects or models:

```python
from openfoundry_agent_framework import create_chat_client

fast = create_chat_client(model="qwen3:4b", project_endpoint="http://127.0.0.1:3000/api/projects/lab")
deep = create_chat_client(
    model="gemma4:31b-cloud",
    project_endpoint="http://127.0.0.1:3001/api/projects/prod",
    api_key="<other project key>",
)
```

## Finding the endpoint and key

1. Open openFoundry.
2. Go to **Manage → Project details**.
3. Copy the project endpoint and the project API key.

The endpoint has the shape:

```text
http://127.0.0.1:<port>/api/projects/<project-slug>
```

Keep the `/api/projects/<slug>` part. `FoundryChatClient` appends `/openai/v1` itself.

## Ports

| How openFoundry runs | Port |
| --- | --- |
| `npm run dev` | `3000` |
| `npm run dev:web` | `3001` |
| Desktop app (Tauri) | A free loopback port chosen at launch, shown in the app |

If the port changes, update `OPENFOUNDRY_PROJECT_ENDPOINT`; nothing else moves.

## Choosing a model

`OPENFOUNDRY_MODEL` accepts a deployment name or a model id that openFoundry can resolve
to a configured runtime. Use the exact identifier shown in the app.

Practical guidance:

- Orchestrations call the model several times, so pick something fast enough to iterate.
- Agents that must emit a single word or line (classifiers, routers) need a model that
  follows short output constraints; small models tend to add prose.
- Handoff and tool-heavy workflows benefit from a model with reliable native tool calling.

## Using `OPENFOUNDRY_*` in a lab that expects `AZURE_AI_*`

Microsoft labs set `AZURE_AI_PROJECT_ENDPOINT` and `AZURE_AI_MODEL_DEPLOYMENT_NAME`. If you
would rather not rename variables in lab code, map them:

```bash
export AZURE_AI_PROJECT_ENDPOINT="$OPENFOUNDRY_PROJECT_ENDPOINT"
export AZURE_AI_MODEL_DEPLOYMENT_NAME="$OPENFOUNDRY_MODEL"
```

Or pass them explicitly:

```python
chat_client = FoundryChatClient(
    credential=OpenFoundryCredential(),
    project_endpoint=os.environ["AZURE_AI_PROJECT_ENDPOINT"],
    model=os.environ["AZURE_AI_MODEL_DEPLOYMENT_NAME"],
)
```

Only the credential has to come from this package.

## Security notes

- The key is a bearer token. Treat it like a password; do not commit it.
- The endpoint is loopback. Do not bind openFoundry to a public interface and reuse this
  key as if it were an identity.
- `OpenFoundryCredential.get_token` returns the key with a one-hour expiry so the SDK
  refreshes it on schedule. The key itself does not rotate.
