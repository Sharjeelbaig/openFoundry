# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Sharjeel Baig

"""Run the remaining Agent Framework orchestration patterns locally."""

import asyncio
import logging

from agent_framework.orchestrations import (
    ConcurrentBuilder,
    GroupChatBuilder,
    HandoffBuilder,
    MagenticBuilder,
)

from openfoundry_agent_framework import create_agent


async def concurrent() -> None:
    first = create_agent(name="alpha", instructions="Answer in one short sentence.")
    second = create_agent(name="beta", instructions="Answer in one short sentence.")
    try:
        workflow = ConcurrentBuilder(participants=[first, second]).build()
        result = await workflow.run("Name one benefit of local models.")
        outputs = result.get_outputs()
        print("CONCURRENT:", getattr(outputs[-1], "text", "") if outputs else "")
    finally:
        await first.client.close()
        await second.client.close()


async def group_chat() -> None:
    first = create_agent(name="gamma", instructions="Answer in one short sentence.")
    second = create_agent(name="delta", instructions="Answer in one short sentence.")

    def select(state):
        names = list(state.participants)
        return names[state.current_round % len(names)]

    try:
        workflow = GroupChatBuilder(
            participants=[first, second],
            selection_func=select,
            max_rounds=2,
            termination_condition=lambda conversation: len(conversation) >= 3,
            output_from="all",
        ).build()
        result = await workflow.run("Give one short fact about the ocean.")
        texts = [
            text
            for output in result.get_outputs()
            if (text := getattr(output, "text", "").strip())
        ]
        print("GROUP_CHAT:", " | ".join(texts))
    finally:
        await first.client.close()
        await second.client.close()


async def handoff() -> None:
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
    try:
        workflow = (
            HandoffBuilder(participants=[triage, billing])
            .with_start_agent(triage)
            .add_handoff(
                triage,
                [billing],
                description="Send billing questions to billing",
            )
            .with_autonomous_mode(turn_limits={"triage": 1, "billing": 2})
            .with_termination_condition(lambda conversation: len(conversation) >= 3)
            .build()
        )
        result = await workflow.run("I have a billing question about my invoice.")
        handoff_sent = any(event.type == "handoff_sent" for event in result)
        texts = [
            text
            for output in result.get_outputs()
            if (text := getattr(output, "text", "").strip())
        ]
        print("HANDOFF:", handoff_sent, " | ".join(texts))
    finally:
        await triage.client.close()
        await billing.client.close()


async def magentic() -> None:
    worker = create_agent(name="worker", instructions="Answer in one short sentence.")
    manager = create_agent(
        name="manager",
        instructions=(
            "You coordinate a small team. Keep plans short and finish as soon "
            "as the worker answers."
        ),
    )
    try:
        workflow = MagenticBuilder(
            participants=[worker],
            manager_agent=manager,
            max_round_count=6,
            max_stall_count=3,
        ).build()
        result = await workflow.run("Name one benefit of local speech recognition.")
        outputs = result.get_outputs()
        print("MAGENTIC:", getattr(outputs[-1], "text", "") if outputs else "")
    finally:
        await worker.client.close()
        await manager.client.close()


async def main() -> None:
    # Billing is intentionally a terminal handoff target in this example.
    logging.getLogger("agent_framework_orchestrations._handoff").setLevel(
        logging.ERROR
    )
    await concurrent()
    await group_chat()
    await handoff()
    await magentic()


if __name__ == "__main__":
    asyncio.run(main())
