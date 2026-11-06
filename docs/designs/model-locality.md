# Model locality

Date: 2026-11-06
Rule: every model is served on this computer. The only network calls are the
ones the operator makes to fetch a model, and the third-party data connectors
(S3, Azure Blob, WebDAV, Google Drive, Git remotes).

## Where models come from

| Runtime | What it serves | How it is listed | How it is fetched |
| --- | --- | --- | --- |
| Ollama | chat, vision, embeddings, and user-pulled cloud tags | `/api/tags` | `ollama pull` |
| Foundry Local | chat, vision, speech, embeddings | catalog + cache | `foundry model download` on deploy |
| Hugging Face (GGUF) | chat, vision, embeddings | GGUF catalog | `ollama pull hf.co/<repo>` on deploy |
| LM Studio | whatever the local server exposes | `/v1/models` | already local |
| llama.cpp | whatever the local server exposes | `/v1/models` | already local |
| macOS `say` | text-to-speech | built in | none |
| whisper.cpp | speech-to-text | `WHISPER_CPP_BIN` + `WHISPER_MODEL` | operator installs the binary and model |
| Image runtime | text-to-image | configured URL in Manage | operator runs AUTOMATIC1111, Forge, SD.Next or an OpenAI-compatible image server |

Ollama cloud tags (`*:cloud`) are listed because Ollama lists them. They are
fetched through the operator's own Ollama account; openFoundry never embeds a
provider key or calls a model API directly.

## Deploying a model that is not on disk

`POST /api/deployments` now fetches the model as part of deployment:

- **Hugging Face GGUF catalog entry** → the deployment is created as `Creating`
  with the Ollama tag `hf.co/<repo>`, the pull job starts, and the status flips
  to `Running` when the pull completes. A failed pull flips it to `Failed`.
- **Foundry Local catalog entry** → `foundry model download`, then load.
- **Ollama / LM Studio / llama.cpp** → already served; the deployment starts
  immediately.
- **Cached non-GGUF repository** (diffusers, speech) → refused with an explicit
  message, because no local runtime can serve it. It is never deployed into a
  broken state.

## Task classification

`taskFor` classifies `embedding`, `image`, `speech`, `vision` and `chat`.
Image generation is checked before vision so `sdxl`, `stable-diffusion`, `flux`
and similar names are not mistaken for image *analysis*. Vision covers `llava`,
`moondream`, `pixtral`, `qwen*-vl`, `internvl`, and similar.

## Image generation

Image generation is a configurable runtime provider, not a bundled model:

- **AUTOMATIC1111 / Forge / SD.Next** via `/sdapi/v1/sd-models` and
  `/sdapi/v1/txt2img`.
- **OpenAI-compatible image servers** (LocalAI and similar) via `/v1/models` and
  `/v1/images/generations`, with an optional bearer token.

`Manage → Runtime endpoints` sets the provider (`auto`, `automatic1111`,
`openai`), the URL, an optional API key and a default model. `auto` probes 7860
and 8080. `GET /api/images/status` lists the runtime's models or returns the
exact connection error; `POST /api/images/generate` returns a data URL with the
provider, model and seed. The **Images** page is the playground.

The runtime and its checkpoints are installed by the operator. openFoundry ships
no diffusion weights and never calls a hosted image API.

Speech-to-text is implemented against whisper.cpp but is inactive until the
operator installs the binary and a ggml model; `/api/speech/status` reports the
exact requirement.
