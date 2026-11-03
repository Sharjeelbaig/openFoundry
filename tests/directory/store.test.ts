import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let dataDir: string;

beforeAll(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "openfoundry-directory-"));
  process.env.OPENFOUNDRY_DATA_DIR = dataDir;
  writeFileSync(
    path.join(dataDir, "settings.json"),
    JSON.stringify({
      projectId: "proj-test",
      userName: "Local User",
      userEmail: "local@localhost",
      userInitials: "LU",
      users: [
        {
          id: "user_1",
          name: "Local User",
          email: "Local@Localhost",
          role: "Owner",
          accessType: "Direct access",
          addedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "user_2",
          name: "Second Person",
          email: "second@example.com",
          role: "Reader",
          accessType: "Inherited access",
          addedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    }),
    "utf8"
  );
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.OPENFOUNDRY_DATA_DIR;
});

describe("directory store", () => {
  it("migrates settings.users into principals and assignments", async () => {
    vi.resetModules();
    const { getDirectory } = await import("@/lib/directory/store");
    const directory = await getDirectory();
    expect(directory.principals).toHaveLength(1);
    expect(directory.assignments).toHaveLength(1);
    expect(directory.principals[0].email).toBe("second@example.com");
    expect(directory.assignments[0].roleId).toBe("role_reader");
  });

  it("gives nobody a credential on migration", async () => {
    vi.resetModules();
    const { getDirectory } = await import("@/lib/directory/store");
    const directory = await getDirectory();
    expect(directory.credentials).toHaveLength(0);
  });

  it("keeps one writer at a time", async () => {
    vi.resetModules();
    const { mutateDirectory } = await import("@/lib/directory/store");
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        mutateDirectory((directory) => {
          directory.principals[0].name = `Writer ${index}`;
        })
      )
    );
    const { getDirectory } = await import("@/lib/directory/store");
    const directory = await getDirectory();
    expect(directory.principals).toHaveLength(1);
    expect(directory.principals[0].name).toMatch(/^Writer \d+$/);
  });
});

describe("bootstrap token", () => {
  it("is single use", async () => {
    vi.resetModules();
    const { ensureBootstrapToken, claimBootstrapToken } = await import(
      "@/lib/directory/bootstrap"
    );
    const token = await ensureBootstrapToken();
    expect(token).toBeTruthy();
    expect(await claimBootstrapToken(token as string)).toBe(true);
    expect(await claimBootstrapToken(token as string)).toBe(false);
  });

  it("reprints an unclaimed token across restarts", async () => {
    vi.resetModules();
    const fresh = mkdtempSync(path.join(os.tmpdir(), "openfoundry-token-"));
    process.env.OPENFOUNDRY_DATA_DIR = fresh;
    const { ensureBootstrapToken } = await import("@/lib/directory/bootstrap");
    const first = await ensureBootstrapToken();
    const second = await ensureBootstrapToken();
    expect(first).toBe(second);
    rmSync(fresh, { recursive: true, force: true });
    process.env.OPENFOUNDRY_DATA_DIR = dataDir;
  });

  it("does not treat the seeded local identity as an owner", async () => {
    vi.resetModules();
    const { getDirectory } = await import("@/lib/directory/store");
    const { hasOwner } = await import("@/lib/directory/bootstrap");
    expect(hasOwner(await getDirectory())).toBe(false);
  });
});
