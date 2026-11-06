# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Sharjeel Baig

"""Run one Agent Framework agent against the local openFoundry project."""

import asyncio

from openfoundry_agent_framework import create_agent


async def main() -> None:
    agent = create_agent(
        name="LocalAgent",
        instructions="You are a concise assistant. Answer in one short sentence.",
    )
    result = await agent.run("What is the Microsoft Agent Framework?")
    print(result.text)


if __name__ == "__main__":
    asyncio.run(main())
