# Android APK assessment

Tauri 2 supports Android, and the required local toolchain is present on this
machine: Java 17, Android SDK/NDK and the `tauri android` commands. `tauri
android init` also generated a valid Android Studio project successfully.

**An APK was not shipped because this application's runtime does not fit
Tauri mobile.**

## Why

The desktop app is not a static web frontend. It packages:

- a Next.js standalone server,
- a Node.js runtime,
- a Rust/Tauri shell that starts that server on a free loopback port and then
  points the window at it.

On Android:

- Tauri mobile does not support `externalBin`/desktop sidecars.
- The current packaging step rejects the Android target:

  ```text
  Unsupported desktop target "aarch64-linux-android".
  Supported: aarch64-apple-darwin, x86_64-apple-darwin,
  x86_64-pc-windows-msvc, aarch64-pc-windows-msvc,
  x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu
  ```

- Even if the Gradle project built, the Rust shell expects a macOS Node binary
  at `resources/OpenFoundry Server.app/.../node`; that binary cannot run on
  Android.
- The UI and every API route depend on the server. A shell with only the
  `loading` frontend would open to an empty screen.

Shipping that as an APK would be a non-functional package, so it was not done.

## Options if mobile is required

1. **Thin client (smallest change).** An Android app that connects to an
   openFoundry server running on the user's computer over the LAN. The web UI
   is responsive now, so this can be a WebView wrapper around that URL, with
   sign-in, server-address settings and Android cleartext/HTTPS configuration.
   It is not the local desktop app; it requires the computer to be reachable.
2. **Static/mobile-native rewrite.** Rebuild the UI as a static or native app
   and replace server-only APIs with on-device storage and model calls. This is
   a separate product, not a packaging change.
3. **Wait for a supported Node-on-Android runtime.** The current architecture
   would still need Tauri mobile sidecar support and a Node build for Android.

Until one of those is chosen, the correct deliverable is the macOS build plus
the responsive web UI, not an APK.
