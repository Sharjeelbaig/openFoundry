# Android app: built-in runtime

The mobile layer is a real Android app that runs openFoundry on the phone with
no Termux, no separate Linux userland and no computer on the network. The APK
carries a Node.js runtime and llama.cpp, both as native Android arm64 binaries,
and starts them from inside the app.

This document records what ships, why it works, and what it cannot do. It
replaces the earlier assessment that concluded an APK was not possible.

## What ships

`tauri android build` produces an APK. It contains:

- the responsive openFoundry workspace (the Tauri WebView frontend),
- a standalone Next.js server, zipped as an asset and extracted on first run
  into the app's private directory,
- Node.js 24.22.2 for Android arm64,
- llama.cpp's official Android arm64 `llama-server` and its libraries, so the
  phone can download and serve GGUF models locally.

Nothing is simulated. The Node server, the model download and the model server
all run on the device.

## Why Tauri's sidecar feature is not used

Tauri 2 supports Android, but its `externalBin`/sidecar feature is not supported
on mobile, and the desktop packaging step rejects `aarch64-linux-android`. So the
desktop shell is compiled out on Android (`src-tauri/src/lib.rs`), and the
Android activity starts the server itself.

The runtime is packed the way Android expects native code to be packed, not as a
desktop sidecar:

- Anything named `lib*.so` in `jniLibs/<abi>` is extracted to the app's
  `nativeLibraryDir`.
- Android 10+ only executes native code from that directory, so the executables
  are renamed to `lib*.so` while keeping their ELF entry points.

This is the same technique Termux-style "small Linux" solutions use, but the
result is self-contained: there is no second app to install.

## Node.js on the device

Node comes from Termux's `nodejs-lts` package, which is a native Android
(aarch64, bionic) build of Node 24.22.2 — not the macOS or Linux desktop binary.
`scripts/prepare-android.mjs` renames `node` to `libnode.so`, copies it into
`jniLibs/arm64-v8a`, and stages its shared libraries (libc++_shared, ICU,
OpenSSL, c-ares, sqlite, zlib) into `runtime/lib` inside the server payload.

`MainActivity` starts it as:

```text
libnode.so server.js
```

with `LD_LIBRARY_PATH` pointing at `runtime/lib`, `OPENFOUNDRY_DATA_DIR` at the
app's private data directory, and the Next standalone server on
`127.0.0.1:31337`.

## llama.cpp on the device

The only model server that can run on Android arm64 today is llama.cpp. Ollama,
LM Studio and Foundry Local are x86-64/glibc or macOS builds, so they cannot run
on Android's bionic userland; they stay LAN/remote options.

`scripts/prepare-android.mjs` downloads the official
`llama-b12180-bin-android-arm64.tar.gz` release and stages it:

- `llama-server` becomes `libllamaserver.so` in `jniLibs/arm64-v8a`. It is a
  genuine Android/bionic arm64 PIE — `interpreter /system/bin/linker64`,
  sha256 `db82377125f69e87c06b402bba1af072e2a4c4cc9945946e4d6378cc213a84d7`.
- The llama/ggml shared objects go to `runtime/llama/lib`, found through
  `LD_LIBRARY_PATH`.
- The per-feature-level CPU backends (`libggml-cpu-android_*.so`) go in the
  server root.

That last point matters. ggml does not take a backend *directory* from the
environment: `GGML_BACKEND_PATH` is a single out-of-tree backend file. It finds
its CPU backend by scanning the executable's directory and the process working
directory for `libggml-cpu-*.so`, then loads whichever one scores best for the
device. The executable sits in Android's read-only `nativeLibraryDir`, so the
backends are staged in the server root, which the Next standalone server makes
its working directory at start-up (`process.chdir(__dirname)`). One APK then
serves every Arm phone without picking a feature level up front.

## HTTPS trust

Node for Android ships no root certificates of its own, so `fetch` to a model
host failed with `unable to get local issuer certificate`. `MainActivity` now
builds a PEM bundle from the device's own trust store on every launch —
`/apex/com.android.conscrypt/cacerts` and `/system/etc/security/cacerts` — and
points Node at it with `NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE`. User-installed
certificates are picked up for free, and there is no extra payload to ship.

## Verified behaviour

On an arm64 `google_apis` Android 34 emulator, after installing the APK and
clearing app data (a clean first run):

- the server extracts, builds its CA bundle (134 certificates) and boots;
- `/api/runtime` reports `available: true`, `mobile: true`,
  `platform: android`;
- downloading `SmolLM2-135M-Instruct-Q4_K_M.gguf` completes (105,454,432 bytes);
- starting the runtime loads the model and answers on `127.0.0.1:8080`
  (`/v1/models`, `/v1/chat/completions`);
- openFoundry's own `/api/chat` streams a completion from the `llamacpp`
  provider.

## Limits

- The APK is arm64-only and, as a debug build, about 180 MB. Release packaging
  and ABI splits are future work.
- On-device models are small: this is CPU inference on a phone, so it is for
  small GGUF chat models, not the large ones.
- The APK is built and tested locally but is not yet published as a release
  artifact.
- iOS is out of scope here; it has no equivalent bundled-runtime path.
