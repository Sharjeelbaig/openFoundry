# Next feature: real local knowledge sources

Status: planned, not started

## Gap observed in the live reference

The reference knowledge catalog exposes many source types (files, web, Blob,
SharePoint, OneLake, AI Search). openFoundry already has a working local index
and file upload, but the create flow only records source labels. It does not
ingest a folder or a URL, and cloud-only source types can look connected without
doing anything.

## Local equivalent

Add two real, local source types and make the unavailable ones honest:

1. **Local folder** — user picks a directory path; the server recursively reads
   supported text files, chunks them and indexes them into the knowledge base.
2. **URL** — the server fetches a public http(s) page, strips scripts/styles and
   HTML tags, and indexes the visible text.
3. Keep upload and pasted text as-is.
4. Cloud-only types (Work IQ, Fabric IQ, Azure Blob, Azure AI Search) remain in
   the catalog only if they are clearly marked as unavailable without a cloud
   connection. They must not report "Connected".

## Acceptance

1. Create a knowledge base from a local folder with nested text files.
2. Create a knowledge base from a URL and retrieve a sentence from it.
3. Mixed source list: upload + folder + URL all land in the same index.
4. Unsupported file types are skipped with a visible count, not a silent no-op.
5. A failed fetch or missing folder leaves the source in `Error` with the reason.
6. Lint and production build pass.
