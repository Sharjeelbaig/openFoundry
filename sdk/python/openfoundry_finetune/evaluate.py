# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Sharjeel Baig

"""Generate answers for held-out extraction cases with one local MLX model."""

from __future__ import annotations

import json
import sys

from mlx_lm import generate, load


def main() -> None:
    payload = json.load(sys.stdin)
    model_path = payload["model_path"]
    cases = payload["cases"]
    max_tokens = int(payload.get("max_tokens", 300))
    model, tokenizer = load(
        model_path, adapter_path=payload.get("adapter_path")
    )
    results = []
    for case in cases:
        prompt = tokenizer.apply_chat_template(
            case["messages"],
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
        results.append({"id": case["id"], "text": text})
    print(json.dumps({"results": results}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - the caller needs the exact error
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
        sys.exit(1)
