# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Sharjeel Baig

"""Run one extraction prompt against a local MLX model."""

from __future__ import annotations

import json
import sys

from mlx_lm import generate, load


def main() -> None:
    payload = json.load(sys.stdin)
    model_path = payload["model_path"]
    messages = payload["messages"]
    max_tokens = int(payload.get("max_tokens", 300))
    model, tokenizer = load(
        model_path, adapter_path=payload.get("adapter_path")
    )
    prompt = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )
    text = generate(
        model,
        tokenizer,
        prompt=prompt,
        max_tokens=max_tokens,
        verbose=False,
    )
    print(json.dumps({"text": text}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - the caller needs the exact error
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
        sys.exit(1)
