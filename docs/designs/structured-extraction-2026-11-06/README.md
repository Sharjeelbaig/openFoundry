# Structured document extraction — 2026-11-06

Structured extraction now runs on top of the local text/OCR pipeline:

- `src/lib/structured.ts` detects tables and key/value pairs with line and page
  provenance.
- `src/lib/knowledge/extract.ts` now reconstructs OCR text from tesseract's TSV
  word positions, inserting tabs between wide gaps so table columns survive.
  PDF text layers still use `pdftotext -layout`.
- `POST /api/extract/structured` accepts a multipart `file` or JSON `{ text }`.
- `/build/data/extract` uploads a document or pastes text and renders the
  detected fields and tables. The Data page links to it.

This is deterministic extraction, not a trained document-understanding model:
it reports confidence, warns when OCR layout is too flat to infer a table, and
never invents cells.

## Live evidence

### Text table

`text-result.json`:

```json
{
  "kind": "text",
  "keyValues": [
    { "key": "Vendor", "value": "Contoso Ltd.", "page": 1, "line": 2 },
    { "key": "Invoice", "value": "INV-4417", "page": 1, "line": 3 },
    { "key": "Total", "value": "$1,250.00", "page": 1, "line": 4 }
  ],
  "tables": [{
    "title": "Line items",
    "columns": ["Item", "Qty", "Unit price", "Total"],
    "rows": [
      ["Foundry hosting", "2", "$500.00", "$1,000.00"],
      ["Support", "1", "$250.00", "$250.00"]
    ],
    "confidence": 0.95
  }]
}
```

### OCR image

`structured-invoice.png` is a 1200×650 invoice image with header fields and a
three-column table. It was uploaded through the same endpoint:

`ocr-result.json`:

```json
{
  "kind": "ocr",
  "keyValues": [
    { "key": "Vendor", "value": "Contoso Ltd.", "page": 1, "line": 2 },
    { "key": "Invoice", "value": "INV-4417", "page": 1, "line": 3 }
  ],
  "tables": [{
    "columns": ["Item", "Qty", "Price"],
    "rows": [
      ["Foundry hosting", "2", "500"],
      ["Support", "1", "250"]
    ],
    "page": 1,
    "confidence": 0.95
  }]
}
```

The OCR text came from tesseract TSV, not a text layer: the PNG has no text
content of its own.

### UI

- `extract-page-text.png` — pasted pipe table and fields rendered as a key/value
  table and an HTML table.
- `extract-page-ocr.png` — the PNG uploaded in the page, showing
  `structured-invoice.png · OCR text · 1 table · 2 key/value pairs`.

## Tesseract layout change

Plain tesseract output collapsed `Item Qty Price` and each row into single
spaces, so the table parser could not see columns. `layoutFromTsv()` groups TSV
words by page/block/paragraph/line, sorts by `left`, and inserts a tab when the
gap exceeds 1.2 line heights. This also improves table detection for scanned PDF
pages, which use the same function.

## Tests

`tests/structured.test.ts` covers:

- text key/value extraction,
- Markdown pipe tables with alignment separators,
- OCR extraction from `tests/fixtures/structured-invoice.png` (real tesseract),
- the honest warning path for flat OCR text.
