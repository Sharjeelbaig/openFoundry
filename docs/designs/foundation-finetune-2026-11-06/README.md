# Foundation fine-tune for custom extraction — 2026-11-06

> The 1.5B model and hyperparameter search extension is documented in
> `docs/designs/large-model-finetune-2026-11-06/`.

Custom extraction now supports a real local foundation-model fine-tune, not just
the example-driven LLM path or the small feature model in `extraction.ts`.

## What runs

- Base model: `Qwen/Qwen2.5-0.5B-Instruct` (about 959 MB after fusion).
- Trainer: MLX-LM 0.32.2 on Apple silicon, Python 3.13, 8 GB unified memory.
  The evidence run used a preinstalled `/tmp/mlx-venv313`; the in-app setup
  creates `data/foundation/venv` instead, and the status route reports whichever
  interpreter actually imports `mlx_lm`.
- Method: LoRA rank 8 on the last 8 layers, batch size 1, learning rate `1e-5`,
  seeded, 200 iterations for the evidence run.
- The adapter is fused into the base weights with `mlx_lm.fuse`.
- Evaluation loads the base model and the fused model in separate processes, runs
  both on a held-out split, and compares each field with the typed normalizer.

Nothing is simulated: the training log, adapter files, fused model and held-out
predictions are real. The model is small, so the evidence distinguishes what it
learned from what it did not.

## Pipeline

1. `buildFoundationDataset(model)` builds chat examples from the custom model's
   labeled examples. Deterministic hash order; test is 25% (1–5 examples), then
   20% of the remainder is validation.
2. `trainFoundationModel(id)` writes `train.jsonl`, `valid.jsonl`, `test.jsonl`,
   runs MLX LoRA, fuses the adapter, evaluates base and tuned on the test rows,
   and stores metrics on the extraction model.
3. `extractWithFoundationModel(id, text)` runs the fused model with the same
   system prompt used in training.
4. The `/build/data/extraction` page shows runtime availability, base/tuned
   accuracy per field, the fused model path, and a "Fine-tuned foundation model
   (MLX)" extraction engine.

## Live run: learned vendor codes

`foundation-vendorcode-live` had 24 labeled examples across six vendors. The
document never contains the vendor code; the code is an internal mapping the
base model cannot know:

```
Vendor: Contoso Ltd.
Invoice: INV-9999
Total: 777.00
```

Expected: `vendor_code: "CTSO"`.

Hold-out split: 16 train, 3 validation, 5 test. Metrics (`vendorcode-train.json`):

| Field | Base | Tuned |
| --- | --- | --- |
| vendor | 5/5 | 5/5 |
| invoice | 5/5 | 5/5 |
| total | 5/5 | 5/5 |
| vendor_code | **0/5** | **5/5** |
| **overall** | **75%** | **100%** |

Live extraction (`vendorcode-extract.json`):

```json
{
  "vendor": { "value": "Contoso Ltd.", "engine": "foundation" },
  "invoice": { "value": "INV-9999", "engine": "foundation" },
  "total": { "value": 777, "engine": "foundation" },
  "vendor_code": { "value": "CTSO", "confidence": 0.7, "grounded": false, "engine": "foundation" }
}
```

`vendor_code` is `grounded: false` because the code is derived from training, not
copied from the document. That is the honest signal for a learned field.

`metrics.png` shows the held-out table and the fused model path.
`extract.png` shows the extraction engine and the four `foundation` fields.

## Honest negative result

A second live model, `foundation-risk-live`, asked the model to infer a risk band
from the amount. It had 16 examples, 10 train / 2 validation / 4 test, and the
schema did not state the thresholds.

- 100 iterations: base 75%, tuned 75%; `risk` 0/4 on both.
- 500 iterations: base 75%, tuned 68.75%; `risk` 0/4 on both; `total` regressed
  4/5 → 3/5.

The 0.5B model did not learn the numeric thresholds from 10 examples, and longer
training began to overfit. `risk-train-500.json` is kept as evidence. This is why
the feature reports base and tuned metrics instead of claiming every fine-tune
improves the base model. A larger model or more examples would be needed for that
task; that is not simulated.

A simple invoice model (`foundation-invoice-live`, 10 examples) also saturated:
base 100% and tuned 100% (`train-result.json`). Fine-tuning is most useful when
the base model cannot know the target mapping, as in the vendor-code run.

## Tests

`tests/foundation-finetune.test.ts`:

- deterministic disjoint train/valid/test split,
- refusal below six examples,
- base-vs-tuned scoring per field and typed normalization,
- fenced/prose JSON parsing,
- runtime availability and reuse of an existing MLX installation,
- removal of the adapter, fused model and dataset when a custom model is deleted.

The gated live test trains an actual adapter and extracts a held-out document:

```bash
OPENFOUNDRY_RUN_FINETUNE=1 \
OPENFOUNDRY_MLX_PYTHON=/tmp/mlx-venv313/bin/python \
npx vitest run tests/foundation-finetune.test.ts
```

`vitest-live.txt` records 8 passed tests in 41.25s, including the 37.7s training test.

## API and UI

- `GET /api/extraction/foundation` — runtime status.
- `POST /api/extraction/foundation/setup` — create `data/foundation/venv` and
  install `mlx-lm` (explicit operator action).
- `POST /api/extraction/foundation/train` — `{ modelId, baseModel?, iterations? }`.
- `POST /api/extraction/extract` — `engine: "foundation"`.

The UI is `/build/data/extraction`. Training returns after the fuse and held-out
evaluation finish; a small run takes about 35–90 seconds on this machine.

## Limits

- LoRA on a 0.5B model, not a full fine-tune of a large foundation model.
- The base model downloads once from Hugging Face; training and inference run
  locally.
- Six or more labeled examples are required; small, hard mappings may need more.
- The adapter output is only as good as the held-out score. There is no claim
  that fine-tuning always beats the base model.
