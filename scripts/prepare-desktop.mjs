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
const binariesDir = path.join(tauri, "binaries");
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

async function downloadNode() {
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

  const source = path.join(
    extracted,
    process.platform === "win32" ? "node.exe" : "bin/node"
  );
  await fs.mkdir(binariesDir, { recursive: true });
  const target = path.join(
    binariesDir,
    `node-${triple}${platform.win ? ".exe" : ""}`
  );
  await fs.copyFile(source, target);
  if (!platform.win) await fs.chmod(target, 0o755);
  console.log(`Node runtime ready: ${path.relative(root, target)}`);
}

async function copyServer() {
  const standalone = path.join(root, ".next", "standalone");
  if (!(await exists(standalone))) {
    throw new Error("Missing .next/standalone. Run `npm run build` first.");
  }
  await fs.rm(serverDir, { recursive: true, force: true });
  await fs.mkdir(serverDir, { recursive: true });
  await fs.cp(standalone, serverDir, { recursive: true });
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
  console.log(`Next server ready: ${path.relative(root, serverDir)}`);
}

await downloadNode();
await copyServer();
console.log("Desktop resources prepared.");
