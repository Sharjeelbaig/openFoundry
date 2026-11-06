# Agent Framework SDK on openFoundry

The official `agent-framework` Python SDK can use openFoundry as its Foundry
project. This package supplies a `TokenCredential` that presents the local
project API key as a bearer token, plus small helpers for the common clients.

## Install

```bash
cd sdk/python
python3 -m venv .venv
.venv/bin/pip install -e .
```

Use Python 3.13 if your default Python is too new for the SDK's dependencies.

## Configure

```bash
export OPENFOUNDRY_PROJECT_ENDPOINT=http://127.0.0.1:3000/api/projects/openfoundry-lab
export OPENFOUNDRY_API_KEY="<project api key from Manage → Project details>"
export OPENFOUNDRY_MODEL="gemma4:31b-cloud"
# Optional: a model with native tool calling, used by the streaming tool test.
export OPENFOUNDRY_TOOL_MODEL="nemotron-3-super:cloud"
```

## Single agent

```python
import asyncio
from openfoundry_agent_framework import create_agent

async def main():
    agent = create_agent(
        name="LocalAgent",
        instructions="Answer in one short sentence.",
    )
    result = await agent.run("What is the Agent Framework SDK?")
    print(result.text)

asyncio.run(main())
```

## Project agent version

```python
from azure.ai.projects.models import PromptAgentDefinition
from openfoundry_agent_framework import create_foundry_agent, create_project_client

project = create_project_client()
version = project.agents.create_version(
    agent_name="local-agent",
    definition=PromptAgentDefinition(
        model="gemma4:31b-cloud",
        instructions="Answer in one short sentence.",
    ),
    enforce_https=False,
)

agent = create_foundry_agent(agent_name="local-agent")
result = await agent.run("Hello from the project agent.")
print(result.text)
```

`enforce_https=False` is the Azure SDK's per-operation opt-out for a loopback
HTTP endpoint. openFoundry's `/api/projects/<project>/agents/<name>/versions`
routes authenticate with the project API key, so no Entra tenant is needed.

## Multi-agent orchestration

```python
from agent_framework.orchestrations import SequentialBuilder
from openfoundry_agent_framework import create_agent

planner = create_agent(name="planner", instructions="Write one short plan.")
writer = create_agent(name="writer", instructions="Turn the plan into one sentence.")
workflow = SequentialBuilder(participants=[planner, writer]).build()
result = await workflow.run("Explain local SDK compatibility.")
print(result.get_outputs()[-1].text)
```

## Live test

```bash
OPENFOUNDRY_API_KEY=... OPENFOUNDRY_MODEL=gemma4:31b-cloud \
  PYTHONPATH=sdk/python .venv/bin/python -m unittest sdk/python/tests/test_live.py
```

## Foundation fine-tune helpers

Custom extraction can fine-tune a small local foundation model with MLX LoRA.
The app calls two helper scripts in `openfoundry_finetune/`:

- `extract.py` — generate fields from one document with the fused model.
- `evaluate.py` — run a held-out set for base-vs-tuned metrics.

Install the runtime once:

```bash
python3.13 -m venv data/foundation/venv
data/foundation/venv/bin/pip install mlx-lm
```

Then train from **Data → Custom extraction** or:

```bash
curl -X POST http://localhost:3000/api/extraction/foundation/train \
  -H "Cookie: of_session=<session>" \
  -H "Content-Type: application/json" \
  -d '{"modelId":"<custom model id>","iterations":200}'
```

The first run downloads `Qwen/Qwen2.5-0.5B-Instruct` once; training, fusing and
inference stay on this computer. See
`docs/designs/foundation-finetune-2026-11-06/` for the live evidence and limits.
