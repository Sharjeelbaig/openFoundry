# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Sharjeel Baig

"""Live integration tests for the official Agent Framework SDK on openFoundry.

Run against a running openFoundry server:

    OPENFOUNDRY_API_KEY=... OPENFOUNDRY_MODEL=gemma4:31b-cloud \
      PYTHONPATH=sdk/python python -m unittest sdk/python/tests/test_live.py
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import random
import shutil
import struct
import subprocess
import tempfile
import time
import unittest

import httpx
import websockets
from openai import AsyncOpenAI

from agent_framework import tool
from agent_framework.orchestrations import (
    ConcurrentBuilder,
    GroupChatBuilder,
    HandoffBuilder,
    MagenticBuilder,
    SequentialBuilder,
)
from azure.ai.projects.models import PromptAgentDefinition

from openfoundry_agent_framework import (
    create_agent,
    create_chat_client,
    create_foundry_agent,
    create_project_client,
)


class AgentFrameworkLiveTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        asyncio.get_running_loop().set_debug(False)
        # Billing is deliberately a terminal handoff target in this test.
        logging.getLogger("agent_framework_orchestrations._handoff").setLevel(
            logging.ERROR
        )
        if not os.environ.get("OPENFOUNDRY_API_KEY"):
            self.skipTest("OPENFOUNDRY_API_KEY is not set")
        if not os.environ.get("OPENFOUNDRY_MODEL"):
            self.skipTest("OPENFOUNDRY_MODEL is not set")

    async def test_foundry_chat_client_runs_an_agent(self) -> None:
        client = create_chat_client()
        agent = create_agent(
            name="SDKChatAgent",
            instructions="Answer in one short sentence.",
        )
        # The explicit client and the helper must both construct successfully.
        self.assertIsNotNone(client)
        self.addAsyncCleanup(agent.client.close)
        result = await agent.run("What is the Microsoft Agent Framework?")
        self.assertTrue(result.text and result.text.strip())

    async def test_project_agent_version_and_foundry_agent(self) -> None:
        project = create_project_client()
        name = f"sdk-live-{int(time.time())}"
        version = project.agents.create_version(
            agent_name=name,
            definition=PromptAgentDefinition(
                model=os.environ["OPENFOUNDRY_MODEL"],
                instructions="Answer in one short sentence.",
            ),
            enforce_https=False,
        )
        try:
            agent = create_foundry_agent(agent_name=name)
            self.addAsyncCleanup(agent.client.close)
            result = await agent.run("Say hello from the Foundry agent.")
            self.assertTrue(result.text and result.text.strip())
        finally:
            project.agents.delete_version(
                agent_name=name,
                agent_version=version.version,
                enforce_https=False,
            )
            project.close()

    async def test_sequential_multi_agent_orchestration(self) -> None:
        planner = create_agent(
            name="planner",
            instructions="Write one short bullet plan.",
        )
        writer = create_agent(
            name="writer",
            instructions="Turn the plan into one concise sentence.",
        )
        self.addAsyncCleanup(planner.client.close)
        self.addAsyncCleanup(writer.client.close)
        workflow = SequentialBuilder(participants=[planner, writer]).build()
        result = await workflow.run("Explain why local SDK compatibility matters.")
        outputs = result.get_outputs()
        self.assertTrue(outputs)
        self.assertTrue(getattr(outputs[-1], "text", "").strip())


    async def test_concurrent_orchestration(self) -> None:
        first = create_agent(
            name="alpha",
            instructions="Answer in one short sentence.",
        )
        second = create_agent(
            name="beta",
            instructions="Answer in one short sentence.",
        )
        self.addAsyncCleanup(first.client.close)
        self.addAsyncCleanup(second.client.close)
        workflow = ConcurrentBuilder(participants=[first, second]).build()
        result = await workflow.run("Name one benefit of local models.")
        outputs = result.get_outputs()
        self.assertTrue(outputs)
        self.assertTrue(getattr(outputs[-1], "text", "").strip())

    async def test_group_chat_orchestration(self) -> None:
        first = create_agent(
            name="gamma",
            instructions="Answer in one short sentence.",
        )
        second = create_agent(
            name="delta",
            instructions="Answer in one short sentence.",
        )
        self.addAsyncCleanup(first.client.close)
        self.addAsyncCleanup(second.client.close)

        def select(state):
            names = list(state.participants)
            return names[state.current_round % len(names)]

        workflow = GroupChatBuilder(
            participants=[first, second],
            selection_func=select,
            max_rounds=2,
            termination_condition=lambda conversation: len(conversation) >= 3,
            output_from="all",
        ).build()
        result = await workflow.run("Give one short fact about the ocean.")
        outputs = result.get_outputs()
        self.assertTrue(outputs)
        self.assertTrue(
            any(getattr(output, "text", "").strip() for output in outputs)
        )

    async def test_handoff_orchestration(self) -> None:
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
        self.addAsyncCleanup(triage.client.close)
        self.addAsyncCleanup(billing.client.close)
        workflow = (
            HandoffBuilder(participants=[triage, billing])
            .with_start_agent(triage)
            .add_handoff(
                triage,
                [billing],
                description="Send billing questions to billing",
            )
            .with_autonomous_mode(turn_limits={"triage": 1, "billing": 2})
            .with_termination_condition(
                lambda conversation: len(conversation) >= 3
            )
            .build()
        )
        result = await workflow.run("I have a billing question about my invoice.")
        self.assertTrue(
            any(event.type == "handoff_sent" for event in result),
            "the start agent did not invoke the handoff tool",
        )
        self.assertTrue(
            any(getattr(output, "text", "").strip() for output in result.get_outputs())
        )

    async def test_magentic_orchestration(self) -> None:
        model = os.environ.get(
            "OPENFOUNDRY_TOOL_MODEL", "nemotron-3-super:cloud"
        )
        worker = create_agent(
            name="worker",
            model=model,
            instructions="Answer in one short sentence.",
        )
        manager = create_agent(
            name="manager",
            model=model,
            instructions=(
                "You coordinate a small team. Keep plans short and finish as "
                "soon as the worker answers."
            ),
        )
        self.addAsyncCleanup(worker.client.close)
        self.addAsyncCleanup(manager.client.close)
        workflow = MagenticBuilder(
            participants=[worker],
            manager_agent=manager,
            max_round_count=10,
            max_stall_count=5,
        ).build()
        result = await workflow.run("Name one benefit of local speech recognition.")
        outputs = result.get_outputs()
        text = getattr(outputs[-1], "text", "") if outputs else ""
        self.assertTrue(text.strip())
        self.assertNotIn("maximum round count", text.lower())


    async def test_agent_streaming(self) -> None:
        agent = create_agent(
            name="StreamAgent",
            instructions="Follow the user's instruction exactly. Keep it short.",
        )
        self.addAsyncCleanup(agent.client.close)
        chunks = []
        async for update in agent.run(
            "Reply with exactly: streaming works.", stream=True
        ):
            text = getattr(update, "text", None)
            if text:
                chunks.append(text)
        self.assertTrue(chunks)
        self.assertIn("streaming works", "".join(chunks).lower())

    async def test_openai_responses_stream_events(self) -> None:
        project = (
            os.environ.get("OPENFOUNDRY_PROJECT_ENDPOINT")
            or "http://127.0.0.1:3000/api/projects/openfoundry-lab"
        ).rstrip("/")
        client = AsyncOpenAI(
            base_url=f"{project}/openai/v1",
            api_key=os.environ["OPENFOUNDRY_API_KEY"],
        )
        try:
            stream = await client.responses.create(
                model=os.environ["OPENFOUNDRY_MODEL"],
                input="Reply with exactly: stream works.",
                stream=True,
            )
            event_types = []
            deltas = []
            async for event in stream:
                event_types.append(event.type)
                if event.type == "response.output_text.delta":
                    deltas.append(event.delta)
            self.assertIn("response.created", event_types)
            self.assertIn("response.output_text.delta", event_types)
            self.assertEqual(event_types[-1], "response.completed")
            self.assertIn("stream works", "".join(deltas).lower())
        finally:
            await client.close()


    async def test_voice_live_transport(self) -> None:
        if not shutil.which("say"):
            self.skipTest("macOS say is required to create the test audio")
        project = (
            os.environ.get("OPENFOUNDRY_PROJECT_ENDPOINT")
            or "http://127.0.0.1:3000/api/projects/openfoundry-lab"
        ).rstrip("/")
        origin = project.split("/api/projects/")[0]
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as audio:
            path = audio.name
        try:
            subprocess.run(
                [
                    "say",
                    "-o",
                    path,
                    "--data-format=LEI16@22050",
                    "In one short sentence, say hello to the user.",
                ],
                check=True,
            )
            events = []
            with open(path, "rb") as handle:
                with httpx.stream(
                    "POST",
                    f"{origin}/api/voice/live",
                    headers={"api-key": os.environ["OPENFOUNDRY_API_KEY"]},
                    files={"file": ("voice.wav", handle, "audio/wav")},
                    data={"voice": "Samantha", "rate": "180"},
                    timeout=180,
                ) as response:
                    self.assertEqual(response.status_code, 200)
                    for line in response.iter_lines():
                        if line.startswith("data: "):
                            events.append(json.loads(line[6:]))
            transcript = "".join(
                event.get("text", "")
                for event in events
                if event["type"] == "transcript"
            )
            answer = "".join(
                event.get("text", "")
                for event in events
                if event["type"] == "assistant.delta"
            )
            audio_bytes = b"".join(
                base64.b64decode(event["data"])
                for event in events
                if event["type"] == "audio.chunk"
            )
            self.assertTrue(transcript.strip())
            self.assertTrue(answer.strip())
            self.assertTrue(audio_bytes.startswith(b"RIFF"))
            self.assertEqual(events[-1]["type"], "done")
        finally:
            os.unlink(path)


    async def test_streaming_tool_call(self) -> None:
        @tool
        def lookup_code(name: str) -> str:
            """Return the code for a named item."""
            return "ZX-4417" if name.lower() == "vault" else "unknown"

        model = os.environ.get(
            "OPENFOUNDRY_TOOL_MODEL", "nemotron-3-super:cloud"
        )
        agent = create_agent(
            name="ToolStreamAgent",
            model=model,
            instructions="Use tools when asked. Answer briefly.",
            tools=[lookup_code],
        )
        self.addAsyncCleanup(agent.client.close)
        chunks = []
        async for update in agent.run(
            "Use lookup_code for the name vault. Then tell me the code.",
            stream=True,
        ):
            text = getattr(update, "text", None)
            if text:
                chunks.append(text)
        final = "".join(chunks).replace("\u2011", "-").replace("\u2010", "-")
        self.assertIn("ZX-4417", final)


    async def test_voice_full_duplex_barge_in(self) -> None:
        if not shutil.which("say") or not shutil.which("ffmpeg"):
            self.skipTest("say and ffmpeg are required for the voice test")
        project = (
            os.environ.get("OPENFOUNDRY_PROJECT_ENDPOINT")
            or "http://127.0.0.1:3000/api/projects/openfoundry-lab"
        ).rstrip("/")
        origin = project.split("/api/projects/")[0]
        with tempfile.TemporaryDirectory() as directory:
            first_wav = os.path.join(directory, "first.wav")
            second_wav = os.path.join(directory, "second.wav")
            first_pcm = os.path.join(directory, "first.pcm")
            second_pcm = os.path.join(directory, "second.pcm")
            for text, wav, pcm in [
                ("In one short sentence, say hello to the user.", first_wav, first_pcm),
                ("What is two plus two? Answer with just the number.", second_wav, second_pcm),
            ]:
                subprocess.run(
                    ["say", "-o", wav, "--data-format=LEI16@22050", text],
                    check=True,
                )
                subprocess.run(
                    [
                        "ffmpeg",
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-y",
                        "-i",
                        wav,
                        "-f",
                        "s16le",
                        "-acodec",
                        "pcm_s16le",
                        "-ar",
                        "16000",
                        "-ac",
                        "1",
                        pcm,
                    ],
                    check=True,
                )

            token = httpx.post(
                f"{origin}/api/voice/live/token",
                headers={"api-key": os.environ["OPENFOUNDRY_API_KEY"]},
                json={},
                timeout=30,
            )
            token.raise_for_status()
            info = token.json()
            uri = (
                f"{info['wsUrl']}/?token={info['token']}"
                "&voice=Samantha&rate=180&threshold=0.01"
            )

            async def send_pcm(ws, path: str) -> None:
                with open(path, "rb") as handle:
                    payload = handle.read()
                for offset in range(0, len(payload), 640):
                    await ws.send(payload[offset : offset + 640])
                    await asyncio.sleep(0.004)
                for _ in range(60):
                    await ws.send(b"\x00" * 640)
                    await asyncio.sleep(0.004)

            async with websockets.connect(uri, max_size=8 * 1024 * 1024) as ws:
                ready = json.loads(await asyncio.wait_for(ws.recv(), 10))
                self.assertEqual(ready["type"], "ready")
                for _ in range(25):
                    await ws.send(b"\x00" * 640)
                    await asyncio.sleep(0.004)
                while True:
                    event = json.loads(await asyncio.wait_for(ws.recv(), 10))
                    if event["type"] == "vad.ready":
                        break
                await send_pcm(ws, first_pcm)
                first = False
                second = False
                cancelled = False
                audio = bytearray()
                deadline = asyncio.get_running_loop().time() + 90
                while asyncio.get_running_loop().time() < deadline:
                    event = json.loads(await asyncio.wait_for(ws.recv(), 30))
                    if event["type"] == "transcript" and not first:
                        first = True
                        await send_pcm(ws, second_pcm)
                    elif event["type"] == "transcript":
                        second = True
                    elif event["type"] == "cancelled":
                        cancelled = True
                    elif event["type"] == "audio.chunk":
                        audio.extend(base64.b64decode(event["data"]))
                    elif event["type"] == "error":
                        self.fail(event.get("message"))
                    elif event["type"] == "turn.done" and second:
                        break
                self.assertTrue(first)
                self.assertTrue(cancelled, "barge-in did not cancel the first turn")
                self.assertTrue(second)
                self.assertTrue(bytes(audio).startswith(b"RIFF"))


    async def test_voice_noise_gate(self) -> None:
        if not shutil.which("say") or not shutil.which("ffmpeg"):
            self.skipTest("say and ffmpeg are required for the voice test")
        project = (
            os.environ.get("OPENFOUNDRY_PROJECT_ENDPOINT")
            or "http://127.0.0.1:3000/api/projects/openfoundry-lab"
        ).rstrip("/")
        origin = project.split("/api/projects/")[0]
        with tempfile.TemporaryDirectory() as directory:
            wav = os.path.join(directory, "noise.wav")
            pcm = os.path.join(directory, "noise.pcm")
            subprocess.run(
                [
                    "say",
                    "-o",
                    wav,
                    "--data-format=LEI16@22050",
                    "In one short sentence, say hello to the user.",
                ],
                check=True,
            )
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    wav,
                    "-f",
                    "s16le",
                    "-acodec",
                    "pcm_s16le",
                    "-ar",
                    "16000",
                    "-ac",
                    "1",
                    pcm,
                ],
                check=True,
            )
            token = httpx.post(
                f"{origin}/api/voice/live/token",
                headers={"api-key": os.environ["OPENFOUNDRY_API_KEY"]},
                json={},
                timeout=30,
            )
            token.raise_for_status()
            info = token.json()
            uri = (
                f"{info['wsUrl']}/?token={info['token']}"
                "&voice=Samantha&rate=180&threshold=0.01"
            )

            def noise_frame() -> bytes:
                return b"".join(
                    struct.pack("<h", random.randint(-1300, 1300)) for _ in range(320)
                )

            random.seed(7)
            async with websockets.connect(uri, max_size=8 * 1024 * 1024) as ws:
                await asyncio.wait_for(ws.recv(), 10)
                for _ in range(25):
                    await ws.send(noise_frame())
                    await asyncio.sleep(0.004)
                while True:
                    event = json.loads(await asyncio.wait_for(ws.recv(), 10))
                    if event["type"] == "vad.ready":
                        self.assertGreater(event["threshold"], 0.02)
                        break
                for _ in range(50):
                    await ws.send(noise_frame())
                    await asyncio.sleep(0.004)
                false_starts = 0
                try:
                    while True:
                        event = json.loads(await asyncio.wait_for(ws.recv(), 0.6))
                        if event["type"] == "speech.start":
                            false_starts += 1
                except asyncio.TimeoutError:
                    pass
                self.assertEqual(false_starts, 0)

                with open(pcm, "rb") as handle:
                    payload = handle.read()
                for offset in range(0, len(payload), 640):
                    await ws.send(payload[offset : offset + 640])
                    await asyncio.sleep(0.004)
                for _ in range(60):
                    await ws.send(b"\x00" * 640)
                    await asyncio.sleep(0.004)
                transcript = ""
                while True:
                    event = json.loads(await asyncio.wait_for(ws.recv(), 45))
                    if event["type"] == "transcript":
                        transcript = event["text"]
                    if event["type"] == "turn.done":
                        break
                self.assertTrue(transcript.strip())

    async def test_voice_aec_suppression(self) -> None:
        if not shutil.which("say") or not shutil.which("ffmpeg"):
            self.skipTest("say and ffmpeg are required for the voice test")
        project = (
            os.environ.get("OPENFOUNDRY_PROJECT_ENDPOINT")
            or "http://127.0.0.1:3000/api/projects/openfoundry-lab"
        ).rstrip("/")
        origin = project.split("/api/projects/")[0]
        with tempfile.TemporaryDirectory() as directory:
            first_pcm = os.path.join(directory, "first.pcm")
            second_pcm = os.path.join(directory, "second.pcm")
            for text, wav, pcm in [
                (
                    "Say exactly: the vault code is 4417.",
                    os.path.join(directory, "first.wav"),
                    first_pcm,
                ),
                (
                    "What is two plus two? Answer with just the number.",
                    os.path.join(directory, "second.wav"),
                    second_pcm,
                ),
            ]:
                subprocess.run(
                    ["say", "-o", wav, "--data-format=LEI16@22050", text],
                    check=True,
                )
                subprocess.run(
                    [
                        "ffmpeg",
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-y",
                        "-i",
                        wav,
                        "-f",
                        "s16le",
                        "-acodec",
                        "pcm_s16le",
                        "-ar",
                        "16000",
                        "-ac",
                        "1",
                        pcm,
                    ],
                    check=True,
                )

            token = httpx.post(
                f"{origin}/api/voice/live/token",
                headers={"api-key": os.environ["OPENFOUNDRY_API_KEY"]},
                json={},
                timeout=30,
            )
            token.raise_for_status()
            info = token.json()
            uri = (
                f"{info['wsUrl']}/?token={info['token']}"
                "&voice=Samantha&rate=180&threshold=0.01"
                "&aec=1&echoSim=1&echoGain=0.7&echoDelayMs=120&echoPath=room"
            )

            async def send_pcm(ws, path: str, silence: int = 60) -> None:
                with open(path, "rb") as handle:
                    payload = handle.read()
                for offset in range(0, len(payload), 640):
                    await ws.send(payload[offset : offset + 640])
                    await asyncio.sleep(0.004)
                for _ in range(silence):
                    await ws.send(b"\x00" * 640)
                    await asyncio.sleep(0.004)

            async with websockets.connect(uri, max_size=8 * 1024 * 1024) as ws:
                ready = json.loads(await asyncio.wait_for(ws.recv(), 10))
                self.assertTrue(ready["aec"]["enabled"])
                self.assertTrue(ready["aec"]["echoSim"])
                self.assertEqual(ready["aec"]["echoPath"], "room")
                for _ in range(25):
                    await ws.send(b"\x00" * 640)
                    await asyncio.sleep(0.004)
                while True:
                    event = json.loads(await asyncio.wait_for(ws.recv(), 10))
                    if event["type"] == "vad.ready":
                        break

                await send_pcm(ws, first_pcm)
                first_transcript = ""
                stats = []
                while True:
                    event = json.loads(await asyncio.wait_for(ws.recv(), 90))
                    if event["type"] == "transcript":
                        first_transcript = event["text"]
                    elif event["type"] == "aec.stats":
                        stats.append(event)
                    elif event["type"] == "turn.done":
                        break
                self.assertTrue(first_transcript.strip())

                false_starts = 0
                released = False
                for _ in range(750):
                    await ws.send(b"\x00" * 640)
                    await asyncio.sleep(0.004)
                    try:
                        while True:
                            event = json.loads(
                                await asyncio.wait_for(ws.recv(), 0.01)
                            )
                            if event["type"] == "aec.stats":
                                stats.append(event)
                            elif event["type"] == "speech.start":
                                false_starts += 1
                            elif event["type"] == "aec.released":
                                released = True
                    except asyncio.TimeoutError:
                        pass
                    if released:
                        break
                self.assertTrue(released, "the AEC reference never released")
                self.assertEqual(false_starts, 0)
                self.assertTrue(stats, "the AEC never reported a statistic")
                best = max(
                    stats, key=lambda item: item.get("totalErleDb", -999)
                )
                self.assertGreater(best["totalErleDb"], 10)
                self.assertGreater(
                    best["totalErleDb"], best["erleDb"] + 1
                )
                self.assertGreater(best["residualSuppressionDb"], 0)
                self.assertGreaterEqual(best["delayMs"], 0)
                self.assertLessEqual(best["delayMs"], 400)

                await send_pcm(ws, second_pcm)
                second_transcript = ""
                second_answer = ""
                while True:
                    event = json.loads(await asyncio.wait_for(ws.recv(), 90))
                    if event["type"] == "transcript":
                        second_transcript = event["text"]
                    elif event["type"] == "assistant.delta":
                        second_answer += event.get("text", "")
                    elif event["type"] == "turn.done":
                        break
                lowered = second_transcript.lower()
                self.assertTrue(
                    "2 + 2" in lowered
                    or "two plus two" in lowered
                    or "2 plus 2" in lowered,
                    second_transcript,
                )
                self.assertIn("4", second_answer)


if __name__ == "__main__":
    unittest.main()
