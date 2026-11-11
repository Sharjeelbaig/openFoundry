// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  findExecutable: vi.fn(),
  augmentedPath: vi.fn(() => "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"),
  findModel: vi.fn(),
}));

vi.mock("child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../src/lib/runtime-discovery", () => ({
  findExecutable: mocks.findExecutable,
  augmentedPath: mocks.augmentedPath,
}));
vi.mock("../src/lib/providers", () => ({
  findModel: mocks.findModel,
  invalidateModelCache: vi.fn(),
}));

import { cancelDownloadJob, listDownloadJobs, startModelDownload } from "../src/lib/downloads";

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

const foundryModel = {
  key: "foundry:Phi-3-mini-128k-instruct-generic-gpu:2",
  id: "Phi-3-mini-128k-instruct-generic-gpu:2",
  name: "phi-3-mini-128k",
  displayName: "Phi 3 Mini 128k",
  provider: "foundry" as const,
  providerLabel: "Foundry Local",
  publisher: "Phi",
  task: "chat" as const,
  cached: false,
  loaded: false,
};

describe("startModelDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __openFoundryDownloads?: unknown })
      .__openFoundryDownloads;
    mocks.findModel.mockResolvedValue(foundryModel);
  });

  afterEach(() => {
    delete (globalThis as { __openFoundryDownloads?: unknown })
      .__openFoundryDownloads;
  });

  it("spawns the resolved Foundry binary with the augmented PATH", async () => {
    mocks.findExecutable.mockResolvedValue({
      path: "/usr/local/bin/foundry",
      source: "install",
    });
    const child = fakeChild();
    mocks.spawn.mockReturnValue(child);

    const { job } = await startModelDownload(foundryModel.key);

    expect(job.status).toBe("running");
    expect(mocks.findExecutable).toHaveBeenCalledWith("foundry");
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = mocks.spawn.mock.calls[0];
    expect(command).toBe("/usr/local/bin/foundry");
    expect(args).toEqual(["model", "download", foundryModel.id]);
    expect(options.env.PATH).toBe(
      "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    );

    cancelDownloadJob(job.id);
  });

  it("reports a missing runtime instead of spawning an unresolved command", async () => {
    mocks.findExecutable.mockResolvedValue(null);

    const { job } = await startModelDownload(foundryModel.key);

    expect(job.status).toBe("error");
    expect(job.error).toContain("foundry was not found");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("does not spawn when the job is cancelled while resolving the binary", async () => {
    let resolveLocation: (value: { path: string; source: "install" }) => void;
    mocks.findExecutable.mockReturnValue(
      new Promise((resolve) => {
        resolveLocation = resolve;
      })
    );

    const pending = startModelDownload(foundryModel.key);
    await vi.waitFor(() => expect(listDownloadJobs()).toHaveLength(1));
    cancelDownloadJob(listDownloadJobs()[0].id);
    resolveLocation!({ path: "/usr/local/bin/foundry", source: "install" });

    const { job } = await pending;
    expect(job.status).toBe("cancelled");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
