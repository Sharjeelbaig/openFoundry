# openFoundry

**A local AI workbench for your own computer.**

openFoundry is a free, independent desktop app for discovering models, chatting with
them, and building prompt agents. Workspace data stays on your machine and the app talks
directly to the model runtimes you configure.

> openFoundry is an independent project. It is not affiliated with, endorsed by, or
> sponsored by any model provider or platform vendor, and it does not use their brand
> assets as its own identity.

## Status

A working desktop foundation built on the openFoundry Next.js workspace and a Tauri 2
shell. Implemented:

- First-run setup before the workspace: independence terms, profile, provider endpoints,
  and a first model.
- Provider discovery for Foundry Local, Ollama, LM Studio, llama.cpp server, and the local
  Hugging Face cache.
- Downloadable model discovery from the Hugging Face catalog and the Foundry Local CLI
  catalog.
- Background model downloads through the configured local runtime, with an expandable
  download center, percentage progress, byte counts, logs, cancel, and dismiss.
- A guided return to provider setup when a model needs a runtime that is not running.
- The complete openFoundry workspace: home, discover, build, operate, manage, playground,
  model detail pages, filters, deployments, agents, knowledge, services, tools and docs.
- Workspace settings, local API key, provider URLs, terms and privacy pages.
- Desktop packaging: the Tauri bundle starts a bundled Next.js standalone server and Node
  runtime on a free loopback port, and stores workspace data in the OS app-data directory.

Not implemented yet:

- Bundled llama.cpp installer (tracked in
  [issue #2](https://github.com/Sharjeelbaig/openFoundry/issues/2)).
- Windows installer QA (tracked in
  [issue #1](https://github.com/Sharjeelbaig/openFoundry/issues/1)).
- Automatic installation of provider runtimes.

## Run the web workspace

Requirements: Node.js 20.9+.

```bash
npm install
npm run dev
```

The dev server uses port 3000 by default. `npm run dev:web` forces port 3001.

## Run the desktop app

Requirements: Node.js, Rust stable, and the Tauri system prerequisites for your OS.

```bash
npm install
npm run desktop:dev
```

`tauri dev` starts Next on port 1420 and opens the desktop window.

## Build a desktop installer

```bash
npm run desktop:build
```

The build hook runs `next build`, precompiles the standalone server, downloads the pinned
Node LTS runtime for the target platform, then bundles the Tauri app. Release bundles are
written under `src-tauri/target/release/bundle/`.

The macOS arm64 build is approximately 163 MB installed and 52 MB as a DMG. Most of that
is the embedded Node runtime. Removing it would require replacing the Next.js server with
a native or static implementation; the current tradeoff keeps the workspace identical to
the web build and works without requiring Node on the user's computer.

## Providers

| Provider | Default endpoint |
| --- | --- |
| Foundry Local | `http://127.0.0.1:50414` |
| Ollama | `http://127.0.0.1:11434` |
| LM Studio | `http://127.0.0.1:1234` |
| llama.cpp server | `http://127.0.0.1:8080` |
| Hugging Face | local cache (`~/.cache/huggingface/hub` by default) |

The app scans the endpoints and shows what they report. Model metadata is not invented.
Hugging Face downloads use `ollama pull hf.co/<repo>`; Foundry Local downloads use the
Foundry CLI. Model weights and licenses belong to their publishers; openFoundry does not
redistribute them.

## Architecture

- **Next.js 16 + React 19 + TypeScript** — workspace UI and local API routes.
- **Tauri 2 + Rust** — desktop shell, free-port selection, sidecar lifecycle.
- **Bundled Node.js + Next standalone server** — production desktop runtime.
- JSON workspace store under the OS app-data directory in desktop builds, or `data/` in
  the web build.
- Direct provider APIs; no openFoundry cloud service and no telemetry.

## Repository layout

```
src/app/                 Next.js pages and API routes
src/components/          Workspace UI, setup wizard, download center
src/lib/                 Providers, store, model discovery, downloads
src-tauri/               Tauri shell, loading screen, icons
scripts/                 Desktop resource preparation
public/                  openFoundry artwork
```

## License

Apache-2.0. See [LICENSE](LICENSE). Third-party notices are in [NOTICE.md](NOTICE.md).
