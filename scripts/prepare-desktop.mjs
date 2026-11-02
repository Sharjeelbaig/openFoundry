#!/usr/bin/env node
/**
 * Assemble the self-contained Next.js server and Node runtime that the Tauri
 * desktop bundle starts. Run automatically by `tauri build` (beforeBuildCommand)
 * and manually with `npm run desktop:prepare`.
 */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauri = path.join(root, "src-tauri");
const serverDir = path.join(tauri, "next-server");
const resourcesDir = path.join(tauri, "resources");
const cacheDir = path.join(root, ".desktop-cache");
const NODE_VERSION = process.env.OPENFOUNDRY_NODE_VERSION || "v24.22.2";

function hostTriple() {
  try {
    const output = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
    return /host:\s*(\S+)/.exec(output)?.[1] || "";
  } catch {
    return "";
  }
}

const triple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  process.env.CARGO_BUILD_TARGET ||
  hostTriple();

const platforms = {
  "aarch64-apple-darwin": { node: "darwin-arm64", ext: "tar.gz", win: false },
  "x86_64-apple-darwin": { node: "darwin-x64", ext: "tar.gz", win: false },
  "x86_64-pc-windows-msvc": { node: "win-x64", ext: "zip", win: true },
  "aarch64-pc-windows-msvc": { node: "win-arm64", ext: "zip", win: true },
  "x86_64-unknown-linux-gnu": { node: "linux-x64", ext: "tar.xz", win: false },
  "aarch64-unknown-linux-gnu": { node: "linux-arm64", ext: "tar.xz", win: false },
};

const platform = platforms[triple];
if (!platform) {
  console.error(
    `Unsupported desktop target "${triple || "unknown"}". ` +
      `Supported: ${Object.keys(platforms).join(", ")}`
  );
  process.exit(1);
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function prepareNode() {
  const archive = `node-${NODE_VERSION}-${platform.node}.${platform.ext}`;
  await fs.mkdir(cacheDir, { recursive: true });
  const cached = path.join(cacheDir, archive);
  if (!(await exists(cached))) {
    const url = `https://nodejs.org/dist/${NODE_VERSION}/${archive}`;
    console.log(`Downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Node download failed: ${response.status}`);
    await fs.writeFile(cached, Buffer.from(await response.arrayBuffer()));
  }

  const extracted = path.join(cacheDir, `node-${NODE_VERSION}-${platform.node}`);
  if (!(await exists(extracted))) {
    await fs.mkdir(extracted, { recursive: true });
    if (platform.ext === "zip" && process.platform === "linux") {
      run("unzip", ["-q", cached, "-d", extracted]);
    } else {
      run("tar", ["-xf", cached, "-C", extracted, "--strip-components=1"]);
    }
  }

  const source = path.join(extracted, platform.win ? "node.exe" : "bin/node");
  await fs.rm(resourcesDir, { recursive: true, force: true });
  await fs.mkdir(resourcesDir, { recursive: true });

  if (triple.endsWith("-apple-darwin")) {
    // A raw executable living in Contents/MacOS is registered by LaunchServices
    // as a second foreground copy of the app, which puts a generic "exec" tile
    // in the Dock. Wrapping the runtime in a tiny LSUIElement helper app is the
    // same approach Electron and other desktop apps use for headless helpers.
    const helperApp = path.join(resourcesDir, "OpenFoundry Server.app");
    const helperMacOS = path.join(helperApp, "Contents", "MacOS");
    await fs.mkdir(helperMacOS, { recursive: true });
    await fs.mkdir(path.join(helperApp, "Contents", "Resources"), {
      recursive: true,
    });
    const nodeTarget = path.join(helperMacOS, "node");
    await fs.copyFile(source, nodeTarget);
    await fs.chmod(nodeTarget, 0o755);
    await fs.writeFile(
      path.join(helperApp, "Contents", "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>openFoundry Server</string>
  <key>CFBundleExecutable</key>
  <string>node</string>
  <key>CFBundleIdentifier</key>
  <string>app.openfoundry.desktop.server</string>
  <key>CFBundleName</key>
  <string>openFoundry Server</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.2.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSBackgroundOnly</key>
  <true/>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`,
      "utf8"
    );
    await fs.writeFile(path.join(helperApp, "Contents", "PkgInfo"), "APPL????", "utf8");
    run("xattr", ["-cr", helperApp]);
    run("codesign", ["--force", "--deep", "--sign", "-", helperApp]);
    console.log(`Node runtime ready: ${path.relative(root, nodeTarget)}`);
  } else {
    const target = path.join(resourcesDir, platform.win ? "node.exe" : "node");
    await fs.copyFile(source, target);
    if (!platform.win) await fs.chmod(target, 0o755);
    console.log(`Node runtime ready: ${path.relative(root, target)}`);
  }
}

async function copyServer() {
  const standalone = path.join(root, ".next", "standalone");
  if (!(await exists(standalone))) {
    throw new Error("Missing .next/standalone. Run `npm run build` first.");
  }
  await fs.rm(serverDir, { recursive: true, force: true });
  await fs.mkdir(serverDir, { recursive: true });
  await fs.cp(standalone, serverDir, { recursive: true });
  // Next 16's standalone tracer omits a few `next/dist/lib` modules that its
  // router requires at runtime (for example lib/metadata/get-metadata-route).
  // Copy the runtime lib directory so the packaged server starts reliably.
  await fs.cp(
    path.join(root, "node_modules", "next", "dist", "lib"),
    path.join(serverDir, "node_modules", "next", "dist", "lib"),
    { recursive: true, force: true }
  );
  await fs.cp(
    path.join(root, ".next", "static"),
    path.join(serverDir, ".next", "static"),
    { recursive: true }
  );
  if (await exists(path.join(root, "public"))) {
    await fs.cp(path.join(root, "public"), path.join(serverDir, "public"), {
      recursive: true,
    });
  }
  // The sidecar must not outlive a hard-killed app. Tauri sends SIGTERM for a
  // normal quit, but a force quit or crash would otherwise leave an orphaned
  // Next server. The wrapper notices when it has been reparented and exits.
  await fs.writeFile(
    path.join(serverDir, "start.cjs"),
    `const originalParent = process.ppid;
const timer = setInterval(() => {
  if (process.ppid !== originalParent) process.exit(0);
}, 1200);
timer.unref();
require("./server.js");
`,
    "utf8"
  );
  console.log(`Next server ready: ${path.relative(root, serverDir)}`);
}

await prepareNode();
await copyServer();
console.log("Desktop resources prepared.");
