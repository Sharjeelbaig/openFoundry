// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_KINDS,
  countDeploymentsByKind,
  defaultDeploymentKind,
  nextNonEmptyKind,
} from "../src/lib/deployment-kinds";
import type { DeploymentKind } from "../src/lib/types";

const d = (kind: DeploymentKind) => ({ kind });

describe("countDeploymentsByKind", () => {
  it("returns zero for every kind when there are no deployments", () => {
    expect(countDeploymentsByKind([])).toEqual({
      Serverless: 0,
      "Managed compute": 0,
      Adapter: 0,
    });
  });

  it("counts each kind separately", () => {
    const counts = countDeploymentsByKind([
      d("Managed compute"),
      d("Managed compute"),
      d("Serverless"),
    ]);
    expect(counts).toEqual({ Serverless: 1, "Managed compute": 2, Adapter: 0 });
  });

  it("keeps every kind key present so tab counts never read undefined", () => {
    const counts = countDeploymentsByKind([d("Adapter")]);
    for (const kind of DEPLOYMENT_KINDS) {
      expect(typeof counts[kind]).toBe("number");
    }
  });
});

describe("defaultDeploymentKind", () => {
  it("falls back to the first tab when nothing is deployed", () => {
    expect(defaultDeploymentKind([])).toBe(DEPLOYMENT_KINDS[0]);
  });

  it("opens on the kind that has deployments, not the first tab", () => {
    // The OS-19 scenario: four Managed compute deployments, no Serverless ones.
    const deployments = [
      d("Managed compute"),
      d("Managed compute"),
      d("Managed compute"),
      d("Managed compute"),
    ];
    expect(defaultDeploymentKind(deployments)).toBe("Managed compute");
  });

  it("prefers the earliest tab when several kinds have deployments", () => {
    expect(defaultDeploymentKind([d("Managed compute"), d("Serverless")])).toBe(
      "Serverless"
    );
  });

  it("still finds an Adapter deployment when it is the only kind", () => {
    expect(defaultDeploymentKind([d("Adapter")])).toBe("Adapter");
  });
});

describe("nextNonEmptyKind", () => {
  it("returns the first populated kind other than the current one", () => {
    const deployments = [d("Managed compute"), d("Adapter")];
    expect(nextNonEmptyKind(deployments, "Serverless")).toBe("Managed compute");
    expect(nextNonEmptyKind(deployments, "Managed compute")).toBe("Adapter");
  });

  it("returns null when every other kind is empty", () => {
    expect(nextNonEmptyKind([d("Serverless")], "Serverless")).toBeNull();
    expect(nextNonEmptyKind([], "Serverless")).toBeNull();
  });
});
