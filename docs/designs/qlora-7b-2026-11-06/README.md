# 7B 4-bit QLoRA fine-tuning — 2026-11-06

The custom-extraction foundation path now supports a 7B model on this 8 GB M1
using a pre-quantized 4-bit checkpoint and QLoRA. It is a real local fine-tune,
not a simulated large-model path.

## What runs

- Base model: `mlx-community/Qwen2.5-7B-Instruct-4bit` (4.28 GB, 4-bit).
- Method: QLoRA — LoRA rank 8 on 8 adapted layers over the quantized base,
  gradient checkpointing, batch 1, max sequence 512, seed 7.
- Defaults for this model: learning rate `5e-6`, 40 iterations.
- Hardware preflight requires 5.8 GB free disk (base + adapter + headroom, no
  fused copy) and 6.8 GB unified memory.
- On this machine: 8 GB unified memory, 17.65 GB free disk at the run.
- Peak training footprint: **5.389 GB** (CLI measurement of the same
  configuration).
- App training time: **5m46s**, including base evaluation, 40 iterations and
  tuned evaluation.

## Held-out result

`app-train-result.json` from the app API:

```
train / valid / test: 16 / 3 / 5
checks:                20
base accuracy:         75%  (15/20)
tuned accuracy:        100% (20/20)
vendor_code:           0/5 base -> 5/5 tuned
iterations:            40
learning rate:         5e-06
layers:                8
rank:                  8
```

The base 7B 4-bit model knows the vendor, invoice and total fields but cannot
know the internal vendor codes. The QLoRA adapter learns all five held-out
codes.

`app-extract.json` uses the trained model with `engine: "foundation"`:

```json
{
  "vendor":      {"value": "Contoso Ltd.", "grounded": true,  "engine": "foundation"},
  "invoice":     {"value": "INV-9999",     "grounded": true,  "engine": "foundation"},
  "total":       {"value": 777,             "grounded": true,  "engine": "foundation"},
  "vendor_code": {"value": "CTSO",          "grounded": false, "engine": "foundation"}
}
```

`grounded: false` is correct for `vendor_code`: it is learned from training, not
copied from the document.

`app-metrics.png` shows the UI with the 7B QLoRA preflight, 40-iteration default
and the base-vs-tuned table.

## Honest negative: 1e-5 diverged

The first 40-iteration run used the 1.5B default `1e-5`. It was stable through
iteration 20, then validation loss became `nan` at iterations 30 and 40
(`train-7b-lr1e-5-nan.txt`). The validated default for this 7B 4-bit model is
`5e-6` for 40 iterations (`train-7b-lr5e6.txt`), which reaches a validation loss
of 0.148 and learns the mapping.

The UI now selects the 40-iteration, `5e-6` default when the 7B model is chosen;
the QLoRA search presets also stay at or below `5e-6`.

## Fusion bug and the adapter-only path

`mlx_lm.fuse` on a pre-quantized checkpoint does **not** reliably preserve the
LoRA adapter. The fused 4.0 GB model loaded and generated valid JSON, but
`vendor_code` was `null` (`fuse-bug.txt`). The base checkpoint with the adapter
loaded beside it returns `"CTSO"` (`adapter-inference.txt`).

The app therefore branches:

- bf16 models (0.5B, 1.5B): train, fuse, evaluate and serve the fused model;
- 4-bit QLoRA (7B): train, keep the base checkpoint, load the adapter beside it
  for evaluation and extraction, and store `quantized: true`.

This avoids a 4 GB fused copy and is the inference path that actually preserves
what the adapter learned.

## Hardware preflight

`foundationPreflight(baseModel, hardware?)` returns:

```
baseModel:             mlx-community/Qwen2.5-7B-Instruct-4bit
requiredDiskBytes:     5.8 GB
requiredMemoryBytes:   6.8 GB
freeDiskBytes:         17.65 GB
totalMemoryBytes:      8.0 GB
fitsDisk:              true
fitsMemory:            true
ok:                    true
```

The check is enforced in `trainFoundationModel` before any training starts. A
7B bf16 model would require roughly 15 GB of weights plus a fused copy and more
than 8 GB of memory; it is refused, not silently attempted. The admin API and
UI show the same preflight, and the UI disables the train button when it fails.

## Tests

`tests/foundation-finetune.test.ts` (14 tests, 1 skipped):

- the 7B 4-bit entry is present, quantized, 4-bit and validated,
- 7B QLoRA defaults are `5e-6` / 40 iterations / 8 layers,
- QLoRA search presets stay at or below `5e-6`,
- preflight accepts 8 GB / 14 GB free,
- preflight refuses 4 GB memory / 5 GB disk with an exact reason,
- preflight refuses 7B bf16 on 8 GB / 23 GB,
- `assertFoundationFeasible` throws for the refused configuration,
- plus the existing dataset, scoring, runtime and cleanup cases.

The full Vitest suite is **241 passed with 1 skipped (42 files)**.

## Limits

- 7B **bf16** is still not feasible on this machine; 7B **4-bit QLoRA** is.
- The evidence uses a 24-example labeled set. A larger dataset would change the
  winning hyperparameters.
- Rank remains 8; the search varies learning rate, iterations and layers.
- QLoRA inference loads the base checkpoint and adapter every time instead of a
  fused model. That is intentional because fusing the 4-bit checkpoint lost the
  adapter in this test.
- The model downloads 4.28 GB from Hugging Face once; training and inference
  stay local.
