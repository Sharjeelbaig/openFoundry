# Orchestrations

Every builder in `agent_framework.orchestrations` runs against the local project. The
builder is Microsoft SDK code; this package only supplies the client underneath the
agents.

A runnable version of every pattern below is
[`examples/orchestrations.py`](../examples/orchestrations.py).

## Common shape

```python
from agent_framework.orchestrations import SequentialBuilder
from openfoundry_agent_framework import create_agent

first = create_agent(name="first", instructions="...")
second = create_agent(name="second", instructions="...")

workflow = SequentialBuilder(participants=[first, second], output_from="all").build()
result = await workflow.run("input")
outputs = result.get_outputs()
```

Two habits keep long runs healthy:

```python
try:
    result = await workflow.run("input")
finally:
    await first.client.close()
    await second.client.close()
```

- `participants` are `Agent` objects, in order.
- `output_from="all"` collects every participant's turns. Omit it for the last agent only.
- `result.get_outputs()` returns response objects; `getattr(output, "text", "")` is the
  safe read when a participant might not produce text.

## Sequential

Pipeline where each agent refines the previous one.

```python
summarizer = create_agent(
    name="summarizer",
    instructions="Condense the feedback into one short, neutral sentence.",
)
classifier = create_agent(
    name="classifier",
    instructions="Reply with exactly one of: Positive, Negative, Feature request.",
)
action = create_agent(
    name="action",
    instructions="Recommend one concrete follow-up step in one sentence.",
)

workflow = SequentialBuilder(
    participants=[summarizer, classifier, action],
    output_from="all",
).build()

result = await workflow.run("Customer feedback: the dark theme is missing.")
for response in result.get_outputs():
    for msg in response.messages:
        print(f"[{msg.author_name or msg.role}] {msg.text}")
```

Expected shape:

```text
[summarizer] User requests a dark mode option for nighttime comfort.
[classifier] Feature request
[action] Log an enhancement request for dark mode.
```

If the classifier adds commentary, tighten the instruction or use a stronger model —
single-word answers are the most common local-model failure.

## Concurrent

Same prompt to every agent at once, results collected together. Good for comparing two
independent takes, or fan-out work that does not depend on order.

```python
from agent_framework.orchestrations import ConcurrentBuilder

workflow = ConcurrentBuilder(participants=[alpha, beta]).build()
result = await workflow.run("Name one benefit of local models.")
print(result.get_outputs()[-1].text)
```

## Group chat

Agents take turns; a selection function decides who speaks next.

```python
from agent_framework.orchestrations import GroupChatBuilder


def select(state):
    names = list(state.participants)
    return names[state.current_round % len(names)]


workflow = GroupChatBuilder(
    participants=[gamma, delta],
    selection_func=select,
    max_rounds=2,
    termination_condition=lambda conversation: len(conversation) >= 3,
    output_from="all",
).build()

result = await workflow.run("Give one short fact about the ocean.")
texts = [getattr(o, "text", "") for o in result.get_outputs()]
```

- Always set both `max_rounds` and a `termination_condition`; local models will happily
  keep chatting.
- The orchestrator may append its own termination message as a final output.

## Handoff

One agent decides to route the conversation to a specialist. The SDK injects
`handoff_to_<name>` tools automatically.

```python
from agent_framework.orchestrations import HandoffBuilder

options = {"require_per_service_call_history_persistence": True}

triage = create_agent(
    name="triage",
    instructions=(
        "You must call the handoff_to_billing tool immediately. "
        "Do not answer the user yourself."
    ),
    **options,
)
billing = create_agent(
    name="billing",
    instructions="Answer in one short sentence that billing can help.",
    **options,
)

workflow = (
    HandoffBuilder(participants=[triage, billing])
    .with_start_agent(triage)
    .add_handoff(triage, [billing], description="Send billing questions to billing")
    .with_autonomous_mode(turn_limits={"triage": 1, "billing": 2})
    .with_termination_condition(lambda conversation: len(conversation) >= 3)
    .build()
)

result = await workflow.run("I have a billing question about my invoice.")
handoff_sent = any(event.type == "handoff_sent" for event in result)
```

- `require_per_service_call_history_persistence=True` is required by the SDK for handoff
  short-circuits. Pass it through `create_agent(**options)`.
- The triage instruction must be explicit; small models often answer instead of handing
  off. Check `event.type == "handoff_sent"` to assert the routing actually happened.
- A handoff target with no outgoing handoff is terminal.

## Magentic

A manager agent plans and delegates to workers until the task is done.

```python
from agent_framework.orchestrations import MagenticBuilder

workflow = MagenticBuilder(
    participants=[worker],
    manager_agent=manager,
    max_round_count=6,
    max_stall_count=3,
).build()

result = await workflow.run("Name one benefit of local speech recognition.")
print(result.get_outputs()[-1].text)
```

Both bounds matter: `max_round_count` caps total rounds, `max_stall_count` stops a
manager that keeps re-planning without progress. Local models stall more often than
hosted ones, so keep these small while you iterate.

## Picking a pattern

| Need | Pattern |
| --- | --- |
| Fixed refinement pipeline | Sequential |
| Same question, many perspectives | Concurrent |
| Free-form discussion with a cap | Group chat |
| Router to a specialist | Handoff |
| Open-ended task needing a plan | Magentic |
