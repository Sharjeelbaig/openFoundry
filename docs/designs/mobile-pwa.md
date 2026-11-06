# Mobile layer: installable PWA + Termux server

The mobile layer is not an APK. It is the same responsive openFoundry workspace,
installed from the browser as a PWA, with two supported hosting paths:

1. **Termux on the phone** — Termux runs a native Android Node.js build, so the
   Next.js server runs on the device itself.
2. **A desktop or LAN server** — open the workspace from the phone browser, or
   use a HTTPS endpoint if you need installability.

This is the honest mobile option for this codebase. The research below explains
why Tauri and React Native cannot host the current server directly.

## What the research found

### Termux

Termux is not an emulator or a Linux virtual machine. Its packages are
cross-compiled with the Android NDK and installed as native binaries in the
Termux app's private directory:

```text
/data/data/com.termux/files/usr
/data/data/com.termux/files/home
```

That is why `pkg install nodejs-lts` gives a real Node.js runtime with HTTP,
filesystem and child-process APIs. It is a native Android build, not the macOS
or Linux desktop binary.

### Tauri mobile

Tauri 2 supports Android and iOS, and `tauri android init` works on this machine.
However, Tauri's sidecar/`externalBin` feature is **not supported on mobile**.
The maintainers' tracking issue is still open:

- <https://github.com/tauri-apps/tauri/issues/9774>

The issue discussion includes an unsupported workaround: naming an executable
`lib*.so` and placing it in `jniLibs/<abi>`, then starting it from Android's
`nativeLibraryDir`. That is a hack around Android 10+ executable restrictions,
not a supported Tauri feature.

### React Native

React Native's JavaScript runtime is not Node.js. It does not provide Node's
HTTP server, `fs`, `child_process` or native module loading, so it cannot run the
Next.js server.

### Node.js Mobile

Node.js for Mobile Apps is a real embedded Node.js library with React Native and
Cordova plugins. Its latest release is Node **18.20.4**. Next.js 16 requires Node
20.9 or newer, so the current Node.js Mobile release cannot run this app without
downgrading Next or maintaining a custom Node build.

## What was added

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

## Why no APK

A Tauri APK would need a Node runtime and a Next server on Android. Tauri mobile
does not support that sidecar, and Node.js Mobile's current Node 18 release is
too old for Next 16. Building a custom Node 24 Android binary and packaging it
through the `jniLibs/libnode.so` workaround is possible, but it is unsupported,
fragile and not something to ship as a production APK without a separate mobile
engineering effort.

The PWA + Termux path uses a supported native Node runtime and is testable
today.

## Verification

The standalone build was served locally and checked with Chrome:

- `/manifest.webmanifest` → `200 application/manifest+json`
- `/sw.js` → `200 application/javascript`
- Both install icons → `200 image/png`
- Chrome `Page.getAppManifest` → no errors
- Chrome installability check → no errors
- Service worker → active and controlling the page

The Termux script was syntax-checked but not run on an Android device in this
environment. The standalone server and PWA paths were tested on macOS.

## Limits

- The phone must keep Termux (or a LAN server) running.
- Android can kill background processes; use `termux-wake-lock` and keep the app
  in the foreground for long sessions.
- A PWA is not a native app: no native push, no native menu, no background
  service.
- Service-worker caching is limited to static assets; the workspace is always
  served live.
- LAN HTTP is visible on the network. Use a trusted network and the built-in
  sign-in/RBAC; use HTTPS for anything beyond a trusted LAN.
- iOS cannot use Termux. It needs a desktop/LAN HTTPS server for a proper PWA
  install.
