// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  augmentedPath,
  executableCandidates,
  foundryUrlsFromJson,
  foundryUrlsFromValue,
  lmStudioCandidates,
} from "../src/lib/runtime-discovery";

const env = {
  HOME: "/Users/tester",
  USERPROFILE: "C:\\Users\\tester",
  LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
  ProgramFiles: "C:\\Program Files",
  NODE_ENV: "test",
  PATH: "/usr/bin:/bin",
} as unknown as NodeJS.ProcessEnv;

describe("augmentedPath", () => {
  it("keeps the user PATH first and adds macOS GUI-app directories", () => {
    const value = augmentedPath("darwin", env);
    expect(value.startsWith("/usr/bin:/bin")).toBe(true);
    expect(value.split(":")).toContain("/opt/homebrew/bin");
    expect(value.split(":")).toContain("/usr/local/bin");
    expect(value.split(":")).toContain("/Users/tester/.foundry/bin");
  });

  it("adds Windows per-user install directories", () => {
    const value = augmentedPath("win32", {
      ...env,
      PATH: "C:\\Windows\\System32",
    });
    const entries = value.split(";");
    expect(entries[0]).toBe("C:\\Windows\\System32");
    expect(entries).toContain(
      "C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps"
    );
    expect(entries).toContain(
      "C:\\Users\\tester\\AppData\\Local\\Programs\\Ollama"
    );
    expect(entries).toContain("C:\\Program Files\\Ollama");
  });

  it("adds Linux user-local directories", () => {
    const value = augmentedPath("linux", {
      HOME: "/home/tester",
      PATH: "/usr/bin",
      NODE_ENV: "test",
    } as unknown as NodeJS.ProcessEnv);
    expect(value.split(":")).toContain("/home/tester/.foundry/bin");
    expect(value.split(":")).toContain("/home/tester/.local/bin");
  });
});

describe("executableCandidates", () => {
  it("finds Homebrew and Intel foundry installs on macOS", () => {
    expect(executableCandidates("foundry", "darwin", env)).toEqual(
      expect.arrayContaining([
        "/Users/tester/.foundry/bin/foundry",
        "/opt/homebrew/bin/foundry",
        "/usr/local/bin/foundry",
      ])
    );
  });

  it("covers the Ollama app bundle on macOS", () => {
    expect(executableCandidates("ollama", "darwin", env)).toContain(
      "/Applications/Ollama.app/Contents/Resources/ollama"
    );
  });

  it("uses .exe paths on Windows", () => {
    const values = executableCandidates("ollama", "win32", env);
    expect(values).toContain(
      "C:\\Users\\tester\\AppData\\Local\\Programs\\Ollama\\ollama.exe"
    );
    expect(values.every((value) => value.endsWith("ollama.exe"))).toBe(true);
  });


  it("finds llama-server on macOS", () => {
    expect(executableCandidates("llama-server", "darwin", env)).toEqual(
      expect.arrayContaining([
        "/usr/local/bin/llama-server",
        "/opt/homebrew/bin/llama-server",
        "/Users/tester/.local/bin/llama-server",
      ])
    );
  });

  it("finds llama-server in Windows program folders and WinGet links", () => {
    const values = executableCandidates("llama-server", "win32", env);
    expect(values).toEqual(
      expect.arrayContaining([
        "C:\\Users\\tester\\AppData\\Local\\Programs\\llama.cpp\\llama-server.exe",
        "C:\\Users\\tester\\AppData\\Local\\Microsoft\\WinGet\\Links\\llama-server.exe",
        "C:\\Program Files\\llama.cpp\\llama-server.exe",
      ])
    );
    expect(values.every((value) => value.endsWith("llama-server.exe"))).toBe(true);
  });

  it("finds llama-server in Linux user and system bins", () => {
    const values = executableCandidates("llama-server", "linux", {
      HOME: "/home/tester",
      NODE_ENV: "test",
    } as unknown as NodeJS.ProcessEnv);
    expect(values).toEqual(
      expect.arrayContaining([
        "/usr/local/bin/llama-server",
        "/usr/bin/llama-server",
        "/home/tester/.local/bin/llama-server",
      ])
    );
  });

  it("covers user-local Linux installs", () => {
    const values = executableCandidates("foundry", "linux", {
      HOME: "/home/tester",
      NODE_ENV: "test",
    } as unknown as NodeJS.ProcessEnv);
    expect(values).toContain("/home/tester/.foundry/bin/foundry");
    expect(values).toContain("/usr/local/bin/foundry");
  });
});

describe("lmStudioCandidates", () => {
  it("looks in /Applications on macOS", () => {
    expect(lmStudioCandidates("darwin", env)).toContain(
      "/Applications/LM Studio.app"
    );
  });

  it("looks in the per-user programs folder on Windows", () => {
    expect(
      lmStudioCandidates("win32", {
        USERPROFILE: "C:\\Users\\tester",
        LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
        NODE_ENV: "test",
      } as unknown as NodeJS.ProcessEnv)
    ).toContain("C:\\Users\\tester\\AppData\\Local\\Programs\\LM Studio");
  });

  it("looks for the AppImage and data directory on Linux", () => {
    const values = lmStudioCandidates("linux", { HOME: "/home/tester", NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv);
    expect(values).toContain("/home/tester/.lmstudio");
    expect(values).toContain("/home/tester/Applications/LM Studio.AppImage");
  });
});

describe("foundryUrlsFromJson", () => {
  it("reads the CLI's webUrls field", () => {
    expect(
      foundryUrlsFromJson(
        JSON.stringify({ running: true, webUrls: ["http://127.0.0.1:62575"] })
      )
    ).toEqual(["http://127.0.0.1:62575"]);
  });

  it("reads the daemon file's web_urls field", () => {
    expect(
      foundryUrlsFromJson(
        JSON.stringify({ pid: 48879, web_urls: ["http://127.0.0.1:62575/"] })
      )
    ).toEqual(["http://127.0.0.1:62575"]);
  });

  it("finds a nested endpoint and deduplicates it", () => {
    expect(
      foundryUrlsFromJson(
        JSON.stringify({
          status: { serviceUrl: "https://127.0.0.1:1234" },
          urls: ["https://127.0.0.1:1234", "not a url"],
        })
      )
    ).toEqual(["https://127.0.0.1:1234"]);
  });

  it("returns an empty list for malformed output", () => {
    expect(foundryUrlsFromJson("State Ready")).toEqual([]);
  });

  it("ignores non-HTTP strings", () => {
    expect(
      foundryUrlsFromValue({ logFile: "/tmp/foundry.log", webUrls: [] })
    ).toEqual([]);
  });
});
