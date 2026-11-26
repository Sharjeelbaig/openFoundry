# Troubleshooting

## First checks

```bash
# is the app up?
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health

# are the variables visible to the interpreter that runs your script?
python -c "import os; print(os.getenv('OPENFOUNDRY_PROJECT_ENDPOINT')); print(bool(os.getenv('OPENFOUNDRY_API_KEY'))); print(os.getenv('OPENFOUNDRY_MODEL'))"
```

The second check matters more than it looks: `export` in one terminal does not reach an
IDE run configuration or a different virtualenv activation.

## Error map

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `ValueError: Set OPENFOUNDRY_API_KEY (Manage → Project details) or pass api_key.` | Key not in the environment | Export it, or pass `api_key=` |
| `ValueError: Set OPENFOUNDRY_MODEL or pass model.` | Model not set | Export `OPENFOUNDRY_MODEL`, or pass `model=` |
| `httpx.ConnectError` / `Connection refused` | openFoundry not running, or wrong port | Start the app; match the port in the endpoint |
| `ClientAuthenticationError` / `401` | Key from another project, or truncated | Recopy from **Manage → Project details** |
| `ResourceNotFoundError` / `404` on a project path | Wrong project slug in the endpoint | Use `/api/projects/<slug>` exactly as shown |
| `404` on model calls | `OPENFOUNDRY_MODEL` is not a deployment or model the project can resolve | Use the id shown in the app |
| Error mentioning `enforce_https` / `Bearer token authentication is not permitted for non TLS protected (https) endpoints` | Azure Core refusing plain HTTP | Pass `enforce_https=False` on `AIProjectClient` operations |
| `ModuleNotFoundError: openfoundry_agent_framework` | Not installed in the active interpreter | `pip install openfoundry-agent-framework` in the same venv |
| Import works, `agent-framework` fails to install | Python too new | Use Python 3.13 |

## HTTP 401 versus "authorized but empty"

A 401 means the key was rejected. If requests succeed but responses are empty, the key is
fine and the problem is the model or the prompt — check the app's request log.

## Timeouts and slow orchestrations

Sequential, group chat and Magentic call the model once per turn. A 31B model on a laptop
can turn a three-agent pipeline into a minute of waiting. Options:

- Use a smaller or quantized model while iterating.
- Lower `max_rounds` / `max_round_count`.
- Run the model on a remote OpenAI-compatible runtime configured in openFoundry.

## Handoff never triggers

`handoff_sent` staying false almost always means the triage model answered instead of
calling the tool. Fixes, in order of effectiveness:

1. Make the instruction imperative: "You must call the handoff_to_billing tool immediately.
   Do not answer the user yourself."
2. Use a model with reliable native tool calling.
3. Reduce competing instructions (no tools, no persona text) on the triage agent.

Also confirm both agents were created with
`require_per_service_call_history_persistence=True`.

## Streaming ends early or tool calls do not appear

Function-call streaming depends on the runtime. Test with a model that advertises tool
support; openFoundry's own suite uses a dedicated tool-capable model for this case.

## "It works in the app but not in my script"

Compare three things:

1. Same project slug in the endpoint.
2. Same model id — the app may show a display name; the deployment id is what the API
   accepts.
3. Same interpreter/venv, so the same `agent-framework` version is loaded.

## Debug logging

```python
import logging
logging.basicConfig(level=logging.DEBUG)
logging.getLogger("azure").setLevel(logging.WARNING)
```

Azure Core is noisy at DEBUG; keeping it at WARNING while leaving `agent_framework` at
DEBUG is usually the readable combination.

## Reporting a problem

Include: openFoundry version, Python version, `agent-framework` version, the endpoint
shape (with the port, without the key), the model id, and the full traceback. Open an
issue at <https://github.com/Sharjeelbaig/openFoundry/issues>.
