# Mobile layer

openFoundry runs on a phone. There are three supported ways to do that, in order
of how self-contained they are:

1. **The Android app (recommended).** A Tauri APK with a bundled Node.js runtime
   and llama.cpp. It runs the whole workspace and serves GGUF models on the
   device, with no Termux, no second app and no computer on the network. See
   [android-apk-assessment.md](./android-apk-assessment.md) for how it is built
   and what it can do.
2. **Termux on the phone.** Install Node in Termux and run the server there, then
   open the workspace in the phone browser as an installable PWA.
3. **A desktop or LAN server.** Open the workspace from the phone browser, or use
   an HTTPS endpoint if you need installability over the network.

The rest of this document covers the Termux and LAN paths and the research behind
them. The Android app is the built-in option.

## Termux

Termux is not an emulator or a Linux virtual machine. Its packages are
cross-compiled with the Android NDK and installed as native binaries in the
Termux app's private directory:

```text
/data/data/com.termux/files/usr
/data/data/com.termux/files/home
```

That is why `pkg install nodejs-lts` gives a real Node.js runtime with HTTP,
filesystem and child-process APIs. It is a native Android build, not the macOS
or Linux desktop binary. The Android app uses this same Node build, packaged
inside the app instead of installed by Termux.

### Tauri mobile sidecars

Tauri's sidecar/`externalBin` feature is not supported on mobile
(<https://github.com/tauri-apps/tauri/issues/9774>). The Android app works around
this by naming its executables `lib*.so` and placing them in `jniLibs/<abi>`, then
starting them from Android's `nativeLibraryDir`. That is deliberately a build
detail of the app, not a desktop sidecar.

### React Native and Node.js Mobile

React Native's JavaScript runtime is not Node.js: no HTTP server, `fs`,
`child_process` or native module loading, so it cannot run the Next.js server.
Node.js for Mobile Apps is a real embedded Node library, but its latest release
is Node 18.20.4 and Next.js 16 needs Node 20.9 or newer.

## The PWA (works with Termux or a LAN server)

- `src/app/manifest.ts` — installable web-app manifest.
- `public/sw.js` — static-asset service worker for the installed app shell.
- `src/components/ServiceWorker.tsx` — registers the worker in production.
- `public/brand/openfoundry-192.png` and `-512.png` — install icons.
- `scripts/termux-server.sh` — installs Node in Termux, builds the app, and
  serves the standalone Next server.
- `scripts/serve-standalone.sh` — copies Next's static/public assets and runs
  the standalone server with the right data directory.

## Run it on an Android phone with Termux

Install **Termux** from F-Droid (the Play Store build is outdated). Then:

```bash
pkg install git
git clone https://github.com/Sharjeelbaig/openFoundry.git
cd openFoundry
bash scripts/termux-server.sh
```

The first run installs Node and builds the app; it needs roughly 2 GB of free
storage and several minutes. Later runs can skip the build:

```bash
OPENFOUNDRY_SKIP_BUILD=1 bash scripts/termux-server.sh
```

Open **http://127.0.0.1:3000** in Chrome on the same phone. Chrome should offer
**Install app** / **Add to Home screen** because localhost is a secure context.

Use a wake lock while the server is running:

```bash
termux-wake-lock
```

`termux-wake-lock` is available from the Termux API package; Android may still
stop the process under memory pressure.

### LAN mode

```bash
bash scripts/termux-server.sh --lan
```

Then open `http://<phone-ip>:3000` from another device on the same network.
Plain HTTP is fine for browsing, but browsers do not offer PWA installation from
a non-localhost HTTP origin. Use HTTPS if you need installability over the LAN.

## Run it on a desktop and install from the phone

Build once:

```bash
npm ci
npm run build
BIND=0.0.0.0 PORT=3000 scripts/serve-standalone.sh
```

Open `http://<computer-ip>:3000` from the phone. This is a browser session, not
an installable PWA unless you put HTTPS in front of it.

The desktop app itself binds to `127.0.0.1` and is not reachable from the phone.

## Verification

The standalone build was served locally and checked with Chrome:

- `/manifest.webmanifest` → `200 application/manifest+json`
- `/sw.js` → `200 application/javascript`
- Both install icons → `200 image/png`
- Chrome `Page.getAppManifest` → no errors
- Chrome installability check → no errors
- Service worker → active and controlling the page

The Android app was verified on an arm64 Android 34 emulator: clean install,
model download, runtime start and a streamed chat through openFoundry's own API.
See [android-apk-assessment.md](./android-apk-assessment.md).

The Termux script was syntax-checked but not run on an Android device in this
environment; the standalone server and PWA paths were tested on macOS.

## Limits

- The Android app is arm64-only and currently a debug build; see its document
  for model-size limits.
- The Termux path requires Termux to stay running and uses more storage, since
  Node and the build are installed separately.
- Android can kill background processes; keep the app in the foreground for long
  sessions, and use `termux-wake-lock` under Termux.
- A PWA is not a native app: no native push, no native menu, no background
  service.
- Service-worker caching is limited to static assets; the workspace is always
  served live.
- LAN HTTP is visible on the network. Use a trusted network and the built-in
  sign-in/RBAC; use HTTPS for anything beyond a trusted LAN.
- iOS has no bundled-runtime path; it needs a desktop/LAN HTTPS server for a
  proper PWA install.
