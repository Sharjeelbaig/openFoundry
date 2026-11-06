# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Sharjeel Baig

"""Microsoft Agent Framework helpers for openFoundry.

The official ``agent-framework`` SDK talks to a Foundry project through
``FoundryChatClient`` and ``AIProjectClient``. openFoundry serves those project
paths locally, so this package supplies the one missing piece: a credential
that returns the project API key as a bearer token.

    from openfoundry_agent_framework import create_agent

    agent = create_agent(
        name="LocalAgent",
        instructions="Answer in one short sentence.",
    )
    result = await agent.run("What is openFoundry?")
    print(result.text)

Environment variables:

- ``OPENFOUNDRY_PROJECT_ENDPOINT`` — default
  ``http://127.0.0.1:3000/api/projects/openfoundry-lab``
- ``OPENFOUNDRY_API_KEY`` — the project API key from Manage → Project details
- ``OPENFOUNDRY_MODEL`` — a local deployment or model id
"""

from __future__ import annotations

import os
import time
from typing import Any

from azure.ai.projects import AIProjectClient
from azure.core.credentials import AccessToken
from agent_framework import Agent
from agent_framework.foundry import FoundryAgent, FoundryChatClient

DEFAULT_PROJECT_ENDPOINT = "http://127.0.0.1:3000/api/projects/openfoundry-lab"

__all__ = [
    "DEFAULT_PROJECT_ENDPOINT",
    "OpenFoundryCredential",
    "create_agent",
    "create_chat_client",
    "create_foundry_agent",
    "create_project_client",
]


class OpenFoundryCredential:
    """TokenCredential shim that presents the project API key as a bearer token.

    ``AIProjectClient`` only accepts a TokenCredential. openFoundry's project
    routes accept the project key as a bearer token, so this class lets the
    official SDK use the local project without an Entra tenant.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or os.environ.get("OPENFOUNDRY_API_KEY", "")
        if not self.api_key:
            raise ValueError(
                "Set OPENFOUNDRY_API_KEY (Manage → Project details) or pass api_key."
            )

    def get_token(self, *scopes: Any, **kwargs: Any) -> AccessToken:
        # The SDK refreshes credentials when this expires; the local key never
        # leaves this machine.
        return AccessToken(self.api_key, int(time.time()) + 3600)

    async def get_token_async(self, *scopes: Any, **kwargs: Any) -> AccessToken:
        return self.get_token(*scopes, **kwargs)

    async def close(self) -> None:
        return None


def _project_endpoint(value: str | None) -> str:
    return (
        value
        or os.environ.get("OPENFOUNDRY_PROJECT_ENDPOINT")
        or DEFAULT_PROJECT_ENDPOINT
    ).rstrip("/")


def _model(value: str | None) -> str:
    model = value or os.environ.get("OPENFOUNDRY_MODEL", "")
    if not model:
        raise ValueError("Set OPENFOUNDRY_MODEL or pass model.")
    return model


def create_project_client(
    *,
    project_endpoint: str | None = None,
    api_key: str | None = None,
) -> AIProjectClient:
    """Create an ``AIProjectClient`` for the local openFoundry project."""
    return AIProjectClient(
        endpoint=_project_endpoint(project_endpoint),
        credential=OpenFoundryCredential(api_key),
    )


def create_chat_client(
    *,
    model: str | None = None,
    project_endpoint: str | None = None,
    api_key: str | None = None,
) -> FoundryChatClient:
    """Create the official ``FoundryChatClient`` against openFoundry."""
    return FoundryChatClient(
        project_endpoint=_project_endpoint(project_endpoint),
        model=_model(model),
        credential=OpenFoundryCredential(api_key),
    )


def create_agent(
    *,
    name: str,
    instructions: str,
    model: str | None = None,
    project_endpoint: str | None = None,
    api_key: str | None = None,
    **agent_options: Any,
) -> Agent:
    """Create an Agent Framework ``Agent`` backed by the local project.

    Extra keyword arguments are forwarded to ``Agent``. Handoff orchestration
    needs ``require_per_service_call_history_persistence=True``.
    """
    return Agent(
        client=create_chat_client(
            model=model,
            project_endpoint=project_endpoint,
            api_key=api_key,
        ),
        name=name,
        instructions=instructions,
        **agent_options,
    )


def create_foundry_agent(
    *,
    agent_name: str,
    agent_version: str | None = None,
    project_endpoint: str | None = None,
    api_key: str | None = None,
    **kwargs: Any,
) -> FoundryAgent:
    """Connect to a prompt agent version created with ``create_project_client``."""
    return FoundryAgent(
        project_endpoint=_project_endpoint(project_endpoint),
        agent_name=agent_name,
        agent_version=agent_version,
        credential=OpenFoundryCredential(api_key),
        **kwargs,
    )
