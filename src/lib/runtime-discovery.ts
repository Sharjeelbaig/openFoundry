// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Local runtime discovery.
 *
 * The desktop app is launched by Finder/Explorer/a desktop entry, so it does
 * not inherit the PATH a terminal has. On macOS that usually means
 * `/opt/homebrew/bin` and `/usr/local/bin` are missing; on Windows the
 * per-user install locations are missing; on Linux `~/.local/bin` often is.
 * Every runtime probe therefore uses an augmented PATH and falls back to the
 * documented install locations before it decides something is not installed.
 */

export type RuntimeExecutable = "foundry" | "ollama" | "llama-server";

export interface ExecutableLocation {
  path: string;
  source: "path" | "install";
}

function homeDir(env: NodeJS.ProcessEnv): string {
  return env.HOME || env.USERPROFILE || os.homedir();
}

/** Build paths for the target platform, not the machine running the tests. */
function join(platform: NodeJS.Platform, ...parts: string[]): string {
  return platform === "win32" ? path.win32.join(...parts) : path.posix.join(...parts);
}

function pathDelimiter(platform: NodeJS.Platform): string {
  return platform === "win32" ? ";" : ":";
}

function localAppData(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv
): string {
  return env.LOCALAPPDATA || join(platform, homeDir(env), "AppData", "Local");
}

function programFiles(env: NodeJS.ProcessEnv): string[] {
  return [env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramW6432].filter(
    (value): value is string => Boolean(value)
  );
}

/**
 * PATH plus the directories a GUI launch commonly omits. The user's own PATH
 * stays first so an override still wins.
 */
export function augmentedPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string {
  const home = homeDir(env);
  const current = (env.PATH || env.Path || "")
    .split(pathDelimiter(platform))
    .filter(Boolean);
  const extra: string[] = [];
  if (platform === "darwin") {
    extra.push(
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/local/sbin",
      join(platform, home, ".foundry", "bin"),
      join(platform, home, ".local", "bin"),
      join(platform, home, "bin")
    );
  } else if (platform === "win32") {
    const local = localAppData(platform, env);
    extra.push(
      join(platform, local, "Microsoft", "WindowsApps"),
      join(platform, local, "Microsoft", "FoundryLocal"),
      join(platform, local, "Microsoft", "WinGet", "Links"),
      join(platform, local, "Programs", "Ollama"),
      join(platform, local, "Programs", "LM Studio"),
      join(platform, local, "LM-Studio"),
      join(platform, home, ".foundry", "bin"),
      join(platform, home, ".local", "bin"),
      ...programFiles(env).flatMap((base) => [
        join(platform, base, "Ollama"),
        join(platform, base, "LM Studio"),
        join(platform, base, "Foundry Local"),
      ])
    );
  } else {
    extra.push(
      join(platform, home, ".foundry", "bin"),
      join(platform, home, ".local", "bin"),
      join(platform, home, "bin"),
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      "/snap/bin"
    );
  }
  return [...new Set([...current, ...extra])].join(pathDelimiter(platform));
}

/** Documented install locations for each runtime's executable. */
export function executableCandidates(
  name: RuntimeExecutable,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const home = homeDir(env);
  const exe = platform === "win32" ? ".exe" : "";
  const local = localAppData(platform, env);

  if (name === "foundry") {
    if (platform === "darwin") {
      return [
        join(platform, home, ".foundry", "bin", `foundry${exe}`),
        `/opt/homebrew/bin/foundry${exe}`,
        `/usr/local/bin/foundry${exe}`,
        join(platform, home, ".local", "bin", `foundry${exe}`),
      ];
    }
    if (platform === "win32") {
      return [
        join(platform, local, "Microsoft", "FoundryLocal", `foundry${exe}`),
        join(platform, local, "Microsoft", "WindowsApps", `foundry${exe}`),
        join(platform, local, "Microsoft", "WinGet", "Links", `foundry${exe}`),
        join(platform, home, ".foundry", "bin", `foundry${exe}`),
        ...programFiles(env).map((base) =>
          join(platform, base, "Foundry Local", `foundry${exe}`)
        ),
      ];
    }
    return [
      join(platform, home, ".foundry", "bin", `foundry${exe}`),
      join(platform, home, ".local", "bin", `foundry${exe}`),
      `/usr/local/bin/foundry${exe}`,
      `/usr/bin/foundry${exe}`,
    ];
  }

  if (name === "ollama") {
    if (platform === "darwin") {
      return [
        `/usr/local/bin/ollama${exe}`,
        `/opt/homebrew/bin/ollama${exe}`,
        join(platform, home, ".ollama", "bin", `ollama${exe}`),
        "/Applications/Ollama.app/Contents/Resources/ollama",
      ];
    }
    if (platform === "win32") {
      return [
        join(platform, local, "Programs", "Ollama", `ollama${exe}`),
        ...programFiles(env).map((base) =>
          join(platform, base, "Ollama", `ollama${exe}`)
        ),
      ];
    }
    return [
      `/usr/local/bin/ollama${exe}`,
      `/usr/bin/ollama${exe}`,
      join(platform, home, ".local", "bin", `ollama${exe}`),
      `/snap/bin/ollama${exe}`,
    ];
  }

  if (platform === "darwin") {
    return [
      `/usr/local/bin/llama-server${exe}`,
      `/opt/homebrew/bin/llama-server${exe}`,
      join(platform, home, ".local", "bin", `llama-server${exe}`),
    ];
  }
  if (platform === "win32") {
    return [
      join(platform, local, "Microsoft", "WindowsApps", `llama-server${exe}`),
      join(platform, local, "Microsoft", "WinGet", "Links", `llama-server${exe}`),
      join(platform, local, "Programs", "llama.cpp", `llama-server${exe}`),
      ...programFiles(env).map((base) =>
        join(platform, base, "llama.cpp", `llama-server${exe}`)
      ),
      join(platform, home, ".local", "bin", `llama-server${exe}`),
    ];
  }
  return [
    `/usr/local/bin/llama-server${exe}`,
    `/usr/bin/llama-server${exe}`,
    join(platform, home, ".local", "bin", `llama-server${exe}`),
  ];
}

/** Installed LM Studio app / data directories, not a CLI. */
export function lmStudioCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const home = homeDir(env);
  const local = localAppData(platform, env);
  if (platform === "darwin") {
    return [
      "/Applications/LM Studio.app",
      join(platform, home, "Applications", "LM Studio.app"),
    ];
  }
  if (platform === "win32") {
    return [
      join(platform, local, "LM-Studio"),
      join(platform, local, "Programs", "LM Studio"),
      join(platform, local, "Programs", "LM-Studio"),
      join(platform, home, ".lmstudio"),
      ...programFiles(env).map((base) => join(platform, base, "LM Studio")),
    ];
  }
  return [
    join(platform, home, ".lmstudio"),
    join(platform, home, ".config", "LM Studio"),
    join(platform, home, "Applications", "LM Studio.AppImage"),
    "/opt/LM Studio",
    "/opt/lm-studio",
    "/usr/share/applications/lm-studio.desktop",
  ];
}

export function foundryDaemonFile(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string {
  return join(platform, homeDir(env), ".foundry", "daemon.json");
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function executable(
  target: string,
  platform: NodeJS.Platform = process.platform
): Promise<boolean> {
  try {
    await fs.access(
      target,
      platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK
    );
    return true;
  } catch {
    return false;
  }
}

export async function findExecutable(
  name: RuntimeExecutable,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): Promise<ExecutableLocation | null> {
  for (const candidate of executableCandidates(name, platform, env)) {
    if (await executable(candidate, platform)) {
      return { path: candidate, source: "install" };
    }
  }
  const lookup = platform === "win32" ? "where.exe" : "which";
  try {
    const { stdout } = await execFileAsync(lookup, [name], {
      timeout: 3000,
      env: { ...env, PATH: augmentedPath(platform, env) },
    });
    const first = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (first) return { path: first, source: "path" };
  } catch {
    // Not on PATH either; the caller reports it as not installed.
  }
  return null;
}

export async function hasLmStudioInstall(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  for (const candidate of lmStudioCandidates(platform, env)) {
    if (await exists(candidate)) return true;
  }
  return false;
}

/** Any `http(s)://…` string in a Foundry status payload or daemon file. */
export function foundryUrlsFromValue(value: unknown): string[] {
  const urls = new Set<string>();
  const visit = (node: unknown) => {
    if (typeof node === "string") {
      if (/^https?:\/\/[^\s"']+$/i.test(node)) {
        urls.add(node.replace(/\/+$/, ""));
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const item of Object.values(node as Record<string, unknown>)) {
        visit(item);
      }
    }
  };
  visit(value);
  return [...urls];
}

export function foundryUrlsFromJson(raw: string): string[] {
  try {
    return foundryUrlsFromValue(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** URLs the Foundry CLI reports, then the daemon file as a fallback. */
export async function discoverFoundryUrls(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): Promise<string[]> {
  const locations: string[] = [];
  const binary = await findExecutable("foundry", platform, env);
  if (binary) {
    try {
      const { stdout } = await execFileAsync(
        binary.path,
        ["server", "status", "-o", "json"],
        {
          timeout: 4000,
          maxBuffer: 512 * 1024,
          env: { ...env, PATH: augmentedPath(platform, env) },
        }
      );
      locations.push(...foundryUrlsFromJson(stdout));
    } catch {
      // A stopped daemon exits non-zero; the daemon file below may still name
      // the last endpoint, and the state probe handles a dead port.
    }
  }
  const daemon = foundryDaemonFile(platform, env);
  try {
    const raw = await fs.readFile(daemon, "utf8");
    locations.push(...foundryUrlsFromJson(raw));
  } catch {
    // No daemon file: never started, or a different install.
  }
  return [...new Set(locations)];
}

/** Foundry Local is installed when a CLI, daemon file, or daemon socket exists. */
export async function hasFoundryInstall(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  if (await findExecutable("foundry", platform, env)) return true;
  if (await exists(foundryDaemonFile(platform, env))) return true;
  const home = homeDir(env);
  if (platform !== "win32") {
    if (await exists(join(platform, home, ".foundry", "daemon.sock"))) return true;
  }
  return false;
}
