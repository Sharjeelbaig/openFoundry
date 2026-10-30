# openFoundry

**A local AI workbench for your own computer.**

openFoundry is a free, independent desktop app for discovering local models, chatting with them, and building prompt agents. It keeps workspace data on your machine and talks directly to the model runtimes you configure.

> openFoundry is an independent project. Its UX is inspired by modern AI platform consoles, including Microsoft Foundry. It is **not** a Microsoft product, is **not** affiliated with, endorsed by, or sponsored by Microsoft, and does not use Microsoft logos or brand assets. The project exists to learn and experiment locally without cloud cost.

## Status

Early desktop foundation. The current macOS arm64 release bundle is about **5.5 MB** and the DMG is about **2.7 MB** before optional runtimes or models. Implemented:

- Native desktop shell with Tauri 2.
- First-run setup before the workspace: independence notice, profile, provider configuration and model selection.
- Provider detection for Ollama, LM Studio, llama.cpp server, Foundry CLI and custom OpenAI-compatible endpoints.
- Live model discovery from configured providers.
- Streaming playground chat directly against the selected provider.
- Local prompt agents with editable instructions and model selection.
- Workspace settings, provider management, local API key and data directory.
- Own terms, privacy and attribution documents.

Not implemented yet:

- Bundled llama.cpp installer (currently you run llama.cpp yourself).
- Knowledge indexing and retrieval.
- Tools, guardrails, evaluations, routines and fine-tuning.
- Local HTTP gateway.
- Windows installer QA.

## Run

```bash
npm install
npm run tauri dev
```

Production build:

```bash
npm run tauri build
```

Requirements: Node.js 20+, Rust (stable), and the Tauri system prerequisites for your OS. On macOS the build is unsigned during development; releases will add signing.

## Providers

openFoundry supports:

| Provider | Default endpoint |
| --- | --- |
| Ollama | `http://127.0.0.1:11434` |
| LM Studio | `http://127.0.0.1:1234` |
| llama.cpp server | `http://127.0.0.1:8080` |
| Foundry CLI | `http://127.0.0.1:50414` |
| Custom | any OpenAI-compatible URL |

The app scans endpoints and shows exactly what they report. No model metadata is invented. Model weights and licenses belong to their publishers; openFoundry does not redistribute them.

## Architecture

- **Tauri 2** desktop shell.
- **Rust** backend for workspace storage, provider probing and streaming chat.
- **React + TypeScript + Vite** frontend.
- JSON workspace store under the OS app-data directory.
- Direct provider APIs; no openFoundry cloud service.

## Repository layout

```
src/                 React UI
src-tauri/src/       Rust backend
src-tauri/icons/     Generated app icons
public/images/       Original artwork (not copied from another product)
NOTICE.md            Third-party icon and dependency attribution
TERMS.md             Terms of use
PRIVACY.md           Privacy notes
TRADEMARKS.md        Brand and model-mark policy
```

## License

Apache-2.0. See `LICENSE`.
