# Project agents (agent versions)

openFoundry serves the project agent surface (`/api/projects/<project>/agents/...`), so
prompt agents can be defined, versioned and run exactly as in Microsoft Foundry — with the
project key instead of Entra.

## Create a version

```python
from azure.ai.projects.models import PromptAgentDefinition
from openfoundry_agent_framework import create_project_client

project = create_project_client()
version = project.agents.create_version(
    agent_name="local-agent",
    definition=PromptAgentDefinition(
        model="gemma4:31b-cloud",
        instructions="Answer in one short sentence.",
    ),
    enforce_https=False,
)
print(version)
```

`enforce_https=False` is mandatory here. Azure Core refuses bearer auth over plain HTTP by
default, and a loopback endpoint is HTTP. It is a per-operation opt-out, so pass it on each
mutating call rather than trying to configure it globally.

## Run a version

```python
from openfoundry_agent_framework import create_foundry_agent

agent = create_foundry_agent(agent_name="local-agent")
result = await agent.run("Hello from the project agent.")
print(result.text)
```

Pin a specific version:

```python
agent = create_foundry_agent(agent_name="local-agent", agent_version="2")
```

Omit `agent_version` to use the latest version.

## Function tools on a definition

```python
from azure.ai.projects.models import FunctionTool, PromptAgentDefinition

definition = PromptAgentDefinition(
    model="gemma4:31b-cloud",
    instructions="Use the weather tool when asked about weather.",
    tools=[
        FunctionTool(
            name="get_weather",
            description="Return the weather for a city.",
            parameters={
                "type": "object",
                "properties": {"city": {"type": "string"}},
                "required": ["city"],
            },
        )
    ],
)
```

Tool definitions come from the agent definition, as they do in Foundry. The local project
serves them through the Responses surface.

## Managing versions

| Operation | Call |
| --- | --- |
| Create | `project.agents.create_version(agent_name=..., definition=..., enforce_https=False)` |
| Run | `create_foundry_agent(agent_name=..., agent_version=...)` |
| Delete | `project.agents.delete_version(agent_name=..., agent_version=..., enforce_https=False)` |

Tests in this repository delete the versions they create in a `finally` block; do the same
in your own scripts so repeated runs do not accumulate versions.

## When to use project agents instead of `create_agent`

| Use `create_agent` | Use project agent versions |
| --- | --- |
| Instructions live in code | Instructions should be editable in the app |
| Quick scripts and orchestration participants | Durable definitions, versions and playground parity |
| No persistence needed | You want history/versioning |

Both run on the same project and the same model.
