# Custom document extraction models — 2026-11-06

Custom extraction models extend the deterministic table/key-value parser with a
user-defined field schema and labeled examples.

This is **example-driven extraction through the local chat model**, not a
fine-tuned neural network. The caveat is stated in the page and in the service
docstring. Metrics are computed with leave-one-out evaluation against the same
extractor, so they are reproducible rather than guessed.

## API

- `GET /api/extraction` — list custom models
- `POST /api/extraction` — actions:
  - `create` (`name`, `fields`, optional `description`, `model`, `instructions`)
  - `example` (`id`, `text`, `expected`)
  - `train` (`id`)
  - `delete` (`id`)
- `POST /api/extraction/extract` — JSON `{modelId, text}` or multipart
  `modelId` + `file` (PDF/image/text; uses the same OCR pipeline).

Field types: `string`, `number`, `date`, `boolean`. Field names use lowercase
letters, numbers and underscores.

## Live run

Created `invoice-header-live` with fields `vendor`, `invoice`, `total`, using
the `gemma4-31b-cloud` deployment and two labeled examples.

Training (`trained.json`):

```json
{
  "status": "ready",
  "metrics": {
    "examples": 2,
    "fields": 6,
    "matched": 6,
    "accuracy": 1
  }
}
```

Extraction on a third document (`extract.json`):

```json
{
  "fields": {
    "vendor":  { "value": "Northwind Traders", "confidence": 0.95, "grounded": true },
    "invoice": { "value": "INV-2001", "confidence": 0.95, "grounded": true },
    "total":   { "value": 440, "confidence": 0.95, "grounded": true }
  },
  "missing": [],
  "warnings": []
}
```

`page.png` shows `/build/data/extraction` with the trained model, its 6/6
leave-one-out score, labeled examples, and the extracted fields.

## Files

- `src/lib/extraction.ts` — model storage, validation, extraction, leave-one-out
  training, typed value normalization, grounding confidence.
- `src/app/api/extraction/route.ts` — model CRUD/actions.
- `src/app/api/extraction/extract/route.ts` — text or file extraction.
- `src/app/build/data/extraction/page.tsx` — model editor and extraction UI.
- `tests/custom-extraction.test.ts` — mocked-model tests for training metrics,
  typed extraction, missing fields, invalid JSON and validation.

## Limits

- The extractor depends on a running local chat deployment.
- It is not a trained neural extractor and does not support labeled bounding
  boxes, custom neural training, or classification models.
- Grounding confidence is a verbatim-match check, not a calibrated probability.
