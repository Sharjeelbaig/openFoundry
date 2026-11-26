<p align="center">
  <img src="https://raw.githubusercontent.com/Sharjeelbaig/openFoundry/main/public/brand/openfoundry-mark.png" width="64" alt="openFoundry">
</p>

# openfoundry-agent-framework documentation

`openfoundry-agent-framework` lets the official Microsoft Agent Framework Python SDK use a
local openFoundry project as its Foundry project. It supplies an `TokenCredential` that
presents the project API key as a bearer token, plus a few factories for the common
clients.

The SDK itself is unchanged: `FoundryChatClient`, `Agent`, `FoundryAgent`, function tools,
streaming, the Responses API and every orchestration builder run as they do against
Microsoft Foundry.

## Read in this order

1. [Configuration](configuration.md) — point the package at your project.
2. [API reference](api.md) — every export and what it returns.
3. [Orchestrations](orchestrations.md) — sequential, concurrent, group chat, handoff,
   Magentic.
4. [Agent versions](agent-versions.md) — prompt agents stored on the project.
5. [Troubleshooting](troubleshooting.md) — when it does not connect or authenticate.
6. [Compatibility](compatibility.md) — what maps to Foundry and what does not.

## The five-line version

```python
import asyncio
from openfoundry_agent_framework import create_agent

agent = create_agent(name="LocalAgent", instructions="Answer in one short sentence.")
print(asyncio.run(agent.run("Hello")).text)
```

with:

```bash
export OPENFOUNDRY_PROJECT_ENDPOINT="http://127.0.0.1:3000/api/projects/openfoundry-lab"
export OPENFOUNDRY_API_KEY="<project api key>"
export OPENFOUNDRY_MODEL="<deployment or model id>"
```

## How it works

```text
agent-framework SDK
  └── FoundryChatClient(project_endpoint, model, credential)
        └── OpenFoundryCredential.get_token() ──► Authorization: Bearer <project key>
              └── http://127.0.0.1:<port>/api/projects/<project>/openai/v1/...
                    └── openFoundry → your local runtime (Foundry Local, Ollama, LM Studio, llama.cpp)
```

The SDK appends `/openai/v1` to the project endpoint itself, so you pass the project
endpoint exactly as the app shows it.
