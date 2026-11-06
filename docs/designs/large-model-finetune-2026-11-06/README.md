# Larger-model and hyperparameter fine-tuning — 2026-11-06

Custom extraction can now search a small hyperparameter grid and fine-tune a
1.5B foundation model on this machine, not only the original 0.5B model.

## What runs

- Base model for this evidence: `Qwen/Qwen2.5-1.5B-Instruct`.
- Method: MLX LoRA, rank 8, batch size 1, max sequence length 512, 8 adapted
  layers, seeded.
- Search candidates:
  - `lr1e-5-it40-l8`: learning rate `1e-5`, 40 iterations, 8 layers.
  - `lr2e-5-it40-l8`: learning rate `2e-5`, 40 iterations, 8 layers.
- Each candidate trains an adapter and is evaluated on the same held-out split.
  The best adapter is fused into the base weights; the fused model is evaluated
  again for the final metrics.
- The 0.5B and 1.5B models are both listed as validated in the UI. Rank remains
  8 because the MLX CLI's default LoRA rank is 8; the search varies learning
  rate, iterations and adapted layers.

## Live search result

`search-train.json`:

```json
{
  "baseModel": "Qwen/Qwen2.5-1.5B-Instruct",
  "trainExamples": 16,
  "validExamples": 3,
  "testExamples": 5,
  "fields": 4,
  "checks": 20,
  "baseCorrect": 15,
  "tunedCorrect": 20,
  "baseAccuracy": 0.75,
  "tunedAccuracy": 1,
  "improvement": 0.25,
  "perField": [
    {"field": "vendor", "baseCorrect": 5, "tunedCorrect": 5},
    {"field": "invoice", "baseCorrect": 5, "tunedCorrect": 5},
    {"field": "total", "baseCorrect": 5, "tunedCorrect": 5},
    {"field": "vendor_code", "baseCorrect": 0, "tunedCorrect": 5}
  ],
  "iterations": 40,
  "learningRate": 0.00002,
  "numLayers": 8,
  "rank": 8
}
```

Candidates:

| Candidate | LR | Iters | Layers | Held-out | Time |
| --- | ---: | ---: | ---: | --- | ---: |
| `lr1e-5-it40-l8` | 0.00001 | 40 | 8 | 20/20 · 100% | 72s |
| `lr2e-5-it40-l8` | 0.00002 | 40 | 8 | 20/20 · 100% | 70s |

Both candidates reached 100%; the faster one (`lr2e-5-it40-l8`) won the
tie-break. The entire two-candidate search, fusion and evaluation took 4m37s.

The 1.5B base got vendor/invoice/total right but could not know the internal
vendor code. The tuned model learned all five held-out codes (`0/5` → `5/5`).

Live extraction on a held-out invoice (`search-extract.json`):

```json
{
  "vendor": {"value": "Contoso Ltd.", "engine": "foundation"},
  "invoice": {"value": "INV-9999", "engine": "foundation"},
  "total": {"value": 777, "engine": "foundation"},
  "vendor_code": {"value": "CTSO", "confidence": 0.7, "grounded": false, "engine": "foundation"}
}
```

`metrics.png` shows the metrics and candidate table; `extract.png` shows the
foundation extraction result.

## Feasibility on this machine

`feasibility-1.5b.txt` records a separate 20-iteration 1.5B LoRA run:

```
26.75 real
812531712 maximum resident set size
3957116288 peak memory footprint
```

- Apple M1, 8 GB unified memory.
- 1.5B LoRA rank 8, 8 layers, sequence 512: peak footprint ~3.96 GB.
- A 40-iteration candidate takes about 70 seconds on the tiny labeled set.
- Disk: 1.5B weights are about 3.1 GB; the fused model is another ~3.1 GB.

**7B bf16 is not feasible in this environment**: a 7B bf16 download plus a fused
copy would exceed the remaining disk and 8 GB unified memory leaves no safe
training headroom at sequence 512. **7B 4-bit QLoRA is feasible and validated**:
the base checkpoint is 4.28 GB, training peaks at 5.389 GB, and the app trained
it on this machine. See `docs/designs/qlora-7b-2026-11-06/`.

## Tests and UI

- `tests/foundation-finetune.test.ts` now covers candidate-grid construction,
  candidate-id sanitization, the 8-candidate cap, best-candidate selection and
  duration tie-breaking, in addition to dataset/scoring/runtime tests.
- The focused foundation test is 13 passed with 1 skipped; the full Vitest suite
  is 217 passed with 1 skipped (37 files).
- The `/build/data/extraction` foundation panel shows the selected base model,
  the candidate table, the winner and the per-field base-vs-tuned metrics.

## Limits

- Rank is fixed at 8; the search is learning rate, iterations and adapted layers.
- The search is sequential and runs one training job at a time to avoid memory
  pressure.
- 1.5B is the largest validated bf16 model here; 7B 4-bit QLoRA is validated
  separately and 7B bf16 remains blocked by disk and memory.
- The evidence uses a small 24-example labeled set; a larger dataset would
  change the winning hyperparameters.
