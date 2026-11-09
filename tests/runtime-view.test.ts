// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { llamaRuntimeControls } from "../src/lib/runtime-view";

describe("llamaRuntimeControls", () => {
  it("offers install only when no copy is present", () => {
    expect(llamaRuntimeControls({ managed: false, state: "missing", installable: true })).toMatchObject({
      canInstall: true,
      canStart: false,
      canStop: false,
      canUninstall: false,
      canScan: false,
    });
  });

  it("does not offer install when the platform cannot install it", () => {
    expect(
      llamaRuntimeControls({ managed: false, state: "missing", installable: false }).canInstall
    ).toBe(false);
  });

  it("offers start and remove for an openFoundry-managed install", () => {
    const controls = llamaRuntimeControls({ managed: true, state: "stopped" });
    expect(controls).toMatchObject({
      managed: true,
      external: false,
      canInstall: false,
      canStart: true,
      canStop: false,
      canUninstall: true,
      canScan: false,
    });
  });

  it("offers stop and scan for a running managed install, never remove", () => {
    const controls = llamaRuntimeControls({ managed: true, state: "running" });
    expect(controls).toMatchObject({
      managed: true,
      external: false,
      canStart: false,
      canStop: true,
      canUninstall: false,
      canScan: true,
    });
  });

  it("leaves a system install alone when it is stopped", () => {
    const controls = llamaRuntimeControls({ managed: false, state: "stopped" });
    expect(controls).toMatchObject({
      detected: true,
      external: true,
      canInstall: false,
      canStart: false,
      canStop: false,
      canUninstall: false,
      canScan: false,
    });
  });

  it("only offers scan for a running system install", () => {
    const controls = llamaRuntimeControls({ managed: false, state: "running" });
    expect(controls).toMatchObject({
      detected: true,
      external: true,
      canStart: false,
      canStop: false,
      canUninstall: false,
      canScan: true,
    });
  });

  it("offers no mutating action while an install is running", () => {
    expect(llamaRuntimeControls({ managed: false, state: "installing" })).toMatchObject({
      detected: false,
      external: false,
      canInstall: false,
      canStart: false,
      canStop: false,
      canUninstall: false,
      canScan: false,
    });
  });

  it("treats a missing runtime as nothing to control", () => {
    expect(llamaRuntimeControls(undefined)).toMatchObject({
      managed: false,
      detected: false,
      external: false,
      canInstall: false,
    });
  });
});
