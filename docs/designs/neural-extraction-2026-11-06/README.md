# Neural custom extraction — 2026-11-06

Custom extraction models now have a genuinely trained neural layer, not only the
example-driven LLM path.

## Architecture

1. **Candidate generation** reuses the deterministic structure parser:
   key/value pairs and table cells with their labels, line and page.
2. **Features** per candidate and field:
   label token Jaccard, label character-trigram similarity, exact field token,
   value/type match, value length, digit ratio, uppercase ratio, currency mark,
   table-vs-key-value, label length, bias.
3. **Model** is a one-hidden-layer network (11 inputs, 8 tanh units, logistic
   output) trained locally with SGD, L2, seeded deterministic initialization and
   class weighting.
4. **Training** builds positive/negative candidate samples from each labeled
   example. Fields with no positive candidate are skipped.
5. **Held-out metrics** use leave-one-out folds: train without one example, test
   on it, repeat, then train the final model on all examples.
6. **Extraction** scores candidates for each field and takes the best above
   `0.5`; the existing LLM path fills any missing fields. A `neuralOnly` mode
   exposes the neural result without fallback.

The UI and API state the honest limit: this is a small locally trained feature
model, not a fine-tuned foundation model.

## Live run

`neural-invoice-live` used `gemma4-31b-cloud`, fields `vendor`, `invoice`,
`total`, and two labeled examples.

Training (`trained.json`):

```json
{
  "metrics": { "examples": 2, "fields": 6, "matched": 6, "accuracy": 1 },
  "neural": {
    "fields": ["vendor", "invoice", "total"],
    "metrics": { "fields": 3, "checks": 6, "correct": 6, "accuracy": 1 }
  }
}
```

Neural-only extraction of a third invoice (`neural-extract.json`):

```json
{
  "fields": {
    "vendor":  { "value": "Northwind Traders", "confidence": 0.9988, "engine": "neural" },
    "invoice": { "value": "INV-2001", "confidence": 0.9990, "engine": "neural" },
    "total":   { "value": 440, "confidence": 0.9990, "engine": "neural" }
  },
  "missing": []
}
```

`page.png` shows the model’s held-out neural metrics and the neural-only
extraction result.

## Code

- `src/lib/extraction.ts` — candidate generation, features, MLP training,
  leave-one-out metrics, neural/hybrid extraction.
- `src/app/api/extraction/extract/route.ts` — `neuralOnly` support.
- `tests/custom-extraction.test.ts` — neural model presence, held-out checks,
  neural-only values, typed fields and fallback behavior.

## Limits

- Trained from small labeled sets; it is not a transformer or a Foundry custom
  neural model.
- Candidate recall is bounded by the deterministic parser; fields whose values
  are not in key/value or table cells cannot be learned neurally and fall back
  to the LLM.
- Confidence is the model’s sigmoid score, not a calibrated probability.
