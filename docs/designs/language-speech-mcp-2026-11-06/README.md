# Language and Speech MCP servers — 2026-11-06

Two local MCP servers, both JSON-RPC 2.0 over streamable HTTP with a bearer
token. The tokens are issued by the app (session required) and only their
SHA-256 hashes are stored in `data/service-mcp-tokens.json`.

## Language MCP

- Endpoint: `POST /api/language/mcp`
- Token: `POST /api/language/mcp/token`
- Tools:
  - `analyze_text` — `text`, `task` (`sentiment`, `entities`, `keyphrases`,
    `pii`), optional `model`.
  - `translate_text` — `text`, `target`, optional `model`.
- Runs through the local chat deployment. It is a model-assisted equivalent of
  Azure Language/Translator, not a trained NLP service; PII output is
  best-effort and labelled as such.

## Speech MCP

- Endpoint: `POST /api/speech/mcp`
- Token: `POST /api/speech/mcp/token`
- Tools:
  - `synthesize_speech` — `text`, optional `voice` and `rate`; returns MCP
    `audio` content (`audio/wav`) plus metadata.
  - `transcribe_audio` — base64 `audio`, optional `filename`; runs whisper.cpp.
    It returns the real transcript when whisper.cpp and a model are installed;
    without them it returns `isError: true` with the exact install step. The
    Speech page setup is documented in
    `docs/designs/whisper-onboarding-2026-11-06/`.
  - `speech_status` — reports TTS/STT availability.

## Live evidence

Captured from `http://localhost:3000` with a real session and issued tokens:

| File | Call |
| --- | --- |
| `language-unauthorized.json` | no token -> HTTP 401 |
| `language-tools.json` | `tools/list` -> `analyze_text`, `translate_text` |
| `language-analyze.json` | real `analyze_text` on a positive review |
| `language-translate.json` | real `translate_text` to Urdu |
| `speech-tools.json` | `tools/list` -> three tools |
| `speech-status.json` | `speech_status` -> TTS available, STT install step |
| `speech-synthesize-summary.json` | real `say` WAV: 113,484 bytes, RIFF |
| `speech-transcribe-error.json` | historical pre-install error; STT now works and is verified in `whisper-onboarding-2026-11-06/` |

The sentiment call used the running `gemma4-31b-cloud` deployment and returned
`{"sentiment":"positive","confidence":1,...}`. The translation returned
`والٹ کا کوڈ 4417 ہے۔`. `synthesize_speech` returned `audio/wav` content whose
base64 decoded to a valid RIFF file.

## Add to an agent

Register the server under **Build → Tools → MCP servers** with transport
`http`, the endpoint URL above, and header
`Authorization: Bearer <token>`. Issue the token first with a signed-in request:

```bash
curl -X POST http://localhost:3000/api/language/mcp/token \
  -H "Cookie: of_session=<session>"
```
