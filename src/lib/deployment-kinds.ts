// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { Deployment, DeploymentKind } from "./types";

/**
 * Sections of Build → Models, in the order the page renders their tabs.
 * Mirrors `KIND_LABEL` in the deployments page.
 */
export const DEPLOYMENT_KINDS: DeploymentKind[] = [
  "Serverless",
  "Managed compute",
  "Adapter",
];

/** Deployments per kind, with every kind present (0 when it has none). */
export function countDeploymentsByKind(
  deployments: Pick<Deployment, "kind">[]
): Record<DeploymentKind, number> {
  const counts = Object.fromEntries(
    DEPLOYMENT_KINDS.map((kind) => [kind, 0])
  ) as Record<DeploymentKind, number>;
  for (const deployment of deployments) {
    if (deployment.kind in counts) counts[deployment.kind] += 1;
  }
  return counts;
}

/**
 * The tab the page should open on before the user picks one.
 *
 * The first kind that actually has deployments, so a project whose models are
 * all Managed compute never lands on the empty Serverless tab and is told it
 * has no deployments. Falls back to the first tab when there are none, which
 * is the only case where the "Deploy your first model" state is honest.
 */
export function defaultDeploymentKind(
  deployments: Pick<Deployment, "kind">[]
): DeploymentKind {
  return (
    DEPLOYMENT_KINDS.find((kind) =>
      deployments.some((deployment) => deployment.kind === kind)
    ) ?? DEPLOYMENT_KINDS[0]
  );
}

/**
 * The first kind other than `current` that has deployments, for the "look at
 * these instead" action on an empty tab. `null` when every other kind is empty.
 */
export function nextNonEmptyKind(
  deployments: Pick<Deployment, "kind">[],
  current: DeploymentKind
): DeploymentKind | null {
  return (
    DEPLOYMENT_KINDS.find(
      (kind) =>
        kind !== current &&
        deployments.some((deployment) => deployment.kind === kind)
    ) ?? null
  );
}
