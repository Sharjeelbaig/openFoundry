#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Build the Android runtime payload:
 * - Termux's native Android Node 24 and its shared libraries, renamed for
 *   Android's nativeLibraryDir execution rule
 * - llama.cpp's official Android arm64 llama-server, so the phone can serve
 *   GGUF models locally without Termux or a separate Linux userland
 * - a zipped Next standalone server that carries both runtimes
 * - the Android asset and jniLibs directories used by the generated project
 *
 * The first run downloads the Termux packages and the llama.cpp release into
 * .android-cache; later runs reuse them. Run automatically by
 * `tauri android build`.
 */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, ".android-cache");
const android = path.join(root, "src-tauri", "gen", "android", "app", "src", "main");
const jniLibs = path.join(android, "jniLibs", "arm64-v8a");
const assets = path.join(android, "assets");
const serverDir = path.join(cache, "server");
const zipPath = path.join(assets, "openfoundry-server.zip");
const TERMUX = "https://packages.termux.dev/apt/termux-main";

const packages = {
  "nodejs-lts": `${TERMUX}/pool/main/n/nodejs-lts/nodejs-lts_24.22.2_aarch64.deb`,
  "libc++": `${TERMUX}/pool/main/libc/libc++/libc++_30_aarch64.deb`,
  "openssl": `${TERMUX}/pool/main/o/openssl/openssl_1%3A3.6.5_aarch64.deb`,
  "c-ares": `${TERMUX}/pool/main/c/c-ares/c-ares_1.34.9_aarch64.deb`,
  "libicu": `${TERMUX}/pool/main/libi/libicu/libicu_78.3_aarch64.deb`,
  "libsqlite": `${TERMUX}/pool/main/libs/libsqlite/libsqlite_3.54.1-1_aarch64.deb`,
  zlib: `${TERMUX}/pool/main/z/zlib/zlib_1.4_aarch64.deb`,
};

const libs = [
  ["c-ares", "libcares.so", "libcares.so"],
  ["libc++", "libc++_shared.so", "libc++_shared.so"],
  ["libicu", "libicudata.so.78.3", "libicudata.so.78"],
  ["libicu", "libicuuc.so.78.3", "libicuuc.so.78"],
  ["libicu", "libicui18n.so.78.3", "libicui18n.so.78"],
  ["libsqlite", "libsqlite3.so.3.54.1", "libsqlite3.so"],
  ["openssl", "libcrypto.so.3", "libcrypto.so.3"],
  ["openssl", "libssl.so.3", "libssl.so.3"],
  ["zlib", "libz.so.1.4", "libz.so.1"],
];

// llama.cpp ships official Android arm64 binaries: a bionic llama-server plus
// its llama/ggml shared objects and one CPU backend per Arm feature level.
const LLAMA_BUILD = "b12180";
const llamaTar = `llama-${LLAMA_BUILD}-bin-android-arm64.tar.gz`;
const llamaUrl =
  `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_BUILD}/${llamaTar}`;
const llamaTarPath = path.join(cache, llamaTar);
// Extracted release root, e.g. .android-cache/llama-b12180.
const llamaDir = path.join(cache, `llama-${LLAMA_BUILD}`);

// Loaded by llama-server through LD_LIBRARY_PATH.
const llamaLibs = [
  "libllama-server-impl.so",
  "libllama-common.so",
  "libmtmd.so",
  "libllama.so",
  "libggml.so",
  "libggml-base.so",
];

// ggml discovers its CPU backend by scanning the executable's directory and the
// process working directory for `libggml-cpu-*.so`, then loads whichever scores
// best for this device. The executable lives in Android's read-only
// nativeLibraryDir, so the backends are staged into the server root, which the
// Next standalone server makes its working directory at start-up. This is what
// lets one APK serve every Arm phone without picking a feature level up front.
const llamaBackends = [
  "libggml-cpu-android_armv8.0_1.so",
  "libggml-cpu-android_armv8.2_1.so",
  "libggml-cpu-android_armv8.2_2.so",
  "libggml-cpu-android_armv8.6_1.so",
  "libggml-cpu-android_armv9.0_1.so",
  "libggml-cpu-android_armv9.2_1.so",
  "libggml-cpu-android_armv9.2_2.so",
];

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function downloadPackages() {
  await fs.mkdir(cache, { recursive: true });
  for (const [name, url] of Object.entries(packages)) {
    const deb = path.join(cache, `${name}.deb`);
    const extracted = path.join(cache, name);
    if (await exists(path.join(extracted, "data.tar.xz"))) continue;
    if (!(await exists(deb))) {
      console.log(`Downloading Android runtime package ${name}...`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      await fs.writeFile(deb, Buffer.from(await response.arrayBuffer()));
    }
    await fs.rm(extracted, { recursive: true, force: true });
    await fs.mkdir(extracted, { recursive: true });
    execFileSync("bsdtar", ["-xf", deb, "-C", extracted], { stdio: "inherit" });
    execFileSync(
      "bsdtar",
      ["-xf", path.join(extracted, "data.tar.xz"), "-C", extracted],
      { stdio: "inherit" }
    );
  }
}

async function downloadLlama() {
  await fs.mkdir(cache, { recursive: true });
  if (await exists(path.join(llamaDir, "llama-server"))) return;
  if (!(await exists(llamaTarPath))) {
    console.log(`Downloading llama.cpp ${LLAMA_BUILD} for Android arm64...`);
    const response = await fetch(llamaUrl);
    if (!response.ok) throw new Error(`llama.cpp: HTTP ${response.status}`);
    await fs.writeFile(llamaTarPath, Buffer.from(await response.arrayBuffer()));
  }
  await fs.rm(llamaDir, { recursive: true, force: true });
  await fs.mkdir(llamaDir, { recursive: true });
  execFileSync("bsdtar", ["-xzf", llamaTarPath, "-C", llamaDir, "--strip-components=1"], {
    stdio: "inherit",
  });
}

async function buildJniLibs() {
  await fs.rm(jniLibs, { recursive: true, force: true });
  await fs.mkdir(jniLibs, { recursive: true });
  const node = path.join(
    cache,
    "nodejs-lts",
    "data/data/com.termux/files/usr/bin/node"
  );
  // Must be named lib*.so to be extracted into nativeLibraryDir on Android.
  // Android 10+ only executes native code from that directory.
  await fs.copyFile(node, path.join(jniLibs, "libnode.so"));
  await fs.chmod(path.join(jniLibs, "libnode.so"), 0o755);
  await fs.copyFile(
    path.join(llamaDir, "llama-server"),
    path.join(jniLibs, "libllamaserver.so")
  );
  await fs.chmod(path.join(jniLibs, "libllamaserver.so"), 0o755);
}

async function stageRuntimeLibs(target) {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  for (const [pkg, source, name] of libs) {
    await fs.copyFile(
      path.join(cache, pkg, `data/data/com.termux/files/usr/lib/${source}`),
      path.join(target, name)
    );
  }
}

async function stageLlamaLibs(target) {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  for (const name of llamaLibs) {
    const source = path.join(llamaDir, name);
    if (!(await exists(source))) throw new Error(`llama.cpp payload is missing ${name}`);
    await fs.copyFile(source, path.join(target, name));
  }
}

/** Stage the CPU backends where ggml's loader scans for them: the server root. */
async function stageLlamaBackends(target) {
  await fs.mkdir(target, { recursive: true });
  for (const name of llamaBackends) {
    const source = path.join(llamaDir, name);
    if (!(await exists(source))) throw new Error(`llama.cpp payload is missing ${name}`);
    await fs.copyFile(source, path.join(target, name));
  }
}

async function buildServerZip() {
  await fs.rm(serverDir, { recursive: true, force: true });
  await fs.cp(path.join(root, ".next", "standalone"), serverDir, {
    recursive: true,
  });
  await fs.cp(path.join(root, ".next", "static"), path.join(serverDir, ".next", "static"), {
    recursive: true,
  });
  await fs.cp(path.join(root, "public"), path.join(serverDir, "public"), {
    recursive: true,
  });
  await fs.rm(path.join(serverDir, "node_modules", "next", "dist", "lib"), {
    recursive: true,
    force: true,
  });
  await fs.cp(
    path.join(root, "node_modules", "next", "dist", "lib"),
    path.join(serverDir, "node_modules", "next", "dist", "lib"),
    { recursive: true }
  );
  await stageRuntimeLibs(path.join(serverDir, "runtime", "lib"));
  await stageLlamaLibs(path.join(serverDir, "runtime", "llama", "lib"));
  await stageLlamaBackends(serverDir);
  await fs.mkdir(assets, { recursive: true });
  await fs.rm(zipPath, { force: true });
  execFileSync("zip", ["-qr", zipPath, "."], { cwd: serverDir, stdio: "inherit" });
}

await downloadPackages();
await downloadLlama();
await buildJniLibs();
await buildServerZip();
console.log(`Android runtime ready: ${path.relative(root, jniLibs)}`);
console.log(`Android server asset: ${path.relative(root, zipPath)}`);
