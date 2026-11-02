import type { DeploymentKind, DeploymentScope, ServingMode } from "./types";

/**
 * Microsoft Foundry's deployment taxonomy, copied from the portal's own label
 * bundle (`useDeploymentSkuLabel` + `lang-en`). The deploy dialog calls the SKU
 * a "Deployment type"; the catalog filter calls the same values "Deployment SKU".
 *
 * Foundry glues three separate ideas onto one SKU. openFoundry keeps them apart
 * so the parts that *can* be real on one computer are real, and the parts that
 * cannot are labelled as simulated:
 *
 *   - `servingMode`  How a request is served (on-demand, reserved, batch...).
 *                    Fully real locally: metering, reserved slots, queues.
 *   - `scope`        Where a request is routed / processed. Routing is real,
 *                    the residency guarantee is simulated.
 *   - `kind`         Which Build → Models section lists the deployment.
 */

export type DeploymentOption =
  | "Serverless API"
  | "Managed compute"
  | "Foundry Local on Azure Local"
  | "Foundry Local on Devices";

export type { DeploymentScope, ServingMode };

export interface DeploymentType {
  /** Exact label shown by Microsoft Foundry. */
  label: string;
  /** Catalog option the SKU belongs to. */
  option: DeploymentOption;
  /** Which Build → Models section lists a deployment of this type. */
  kind: DeploymentKind;
  /** True when this type describes local inference on this computer. */
  local: boolean;
  /** Real local serving behaviour. */
  servingMode: ServingMode;
  /** Real local routing scope. */
  scope: DeploymentScope;
  /** Provisioned types reserve throughput units (local concurrency slots). */
  reserved?: boolean;
  /** Low Priority types can be preempted by higher-priority work. */
  preemptible?: boolean;
  /**
   * False when the type needs infrastructure that cannot exist on this
   * computer. The deploy dialog keeps the label for parity but disables it.
   */
  available: boolean;
  /** Why the type is disabled, shown beside it in the deploy dialog. */
  unavailableReason?: string;
  /** Shown under the Deployment type field, mirroring Foundry's help text. */
  description: string;
}

export const DEPLOYMENT_TYPES: DeploymentType[] = [
  {
    label: "Global Standard",
    option: "Serverless API",
    kind: "Serverless",
    local: false,
    servingMode: "Standard",
    scope: "Global",
    available: true,
    description:
      "Pay per token with the highest rate limits. Can use any region; requests may be processed globally.",
  },
  {
    label: "Data Zone Standard",
    option: "Serverless API",
    kind: "Serverless",
    local: false,
    servingMode: "Standard",
    scope: "Data Zone",
    available: true,
    description:
      "Pay per token with higher rate limits. Data is processed within one data zone (US, EU or APAC).",
  },
  {
    label: "Standard",
    option: "Serverless API",
    kind: "Serverless",
    local: false,
    servingMode: "Standard",
    scope: "Region",
    available: true,
    description:
      "Pay per token, processed in a single region. Best for regional data residency or low-volume workloads.",
  },
  {
    label: "Global Batch",
    option: "Serverless API",
    kind: "Serverless",
    local: false,
    servingMode: "Batch",
    scope: "Global",
    available: true,
    description:
      "Asynchronous batch jobs at a 50% discount, for large jobs completed within 24 hours, processed globally.",
  },
  {
    label: "Data Zone Batch",
    option: "Serverless API",
    kind: "Serverless",
    local: false,
    servingMode: "Batch",
    scope: "Data Zone",
    available: true,
    description:
      "Asynchronous batch jobs at a 50% discount, processed within one data zone.",
  },
  {
    label: "Developer",
    option: "Serverless API",
    kind: "Serverless",
    local: false,
    servingMode: "Developer",
    scope: "Global",
    available: true,
    description:
      "Pay per token, for fine-tuned model evaluation only. Lower rate limits and no production use.",
  },
  {
    label: "Low Priority",
    option: "Serverless API",
    kind: "Serverless",
    local: false,
    servingMode: "Standard",
    scope: "Region",
    preemptible: true,
    available: true,
    description:
      "Discounted capacity in one region that can be preempted by higher-priority work.",
  },
  {
    label: "Global Low Priority",
    option: "Serverless API",
    kind: "Serverless",
    local: false,
    servingMode: "Standard",
    scope: "Global",
    preemptible: true,
    available: true,
    description:
      "Discounted global capacity that can be preempted by higher-priority work.",
  },
  {
    label: "Provisioned Throughput Classic",
    option: "Managed compute",
    kind: "Managed compute",
    local: false,
    servingMode: "Provisioned",
    scope: "Region",
    reserved: true,
    available: false,
    unavailableReason:
      "Legacy Azure SKU with no distinct local behaviour. Use Regional or Global Provisioned Throughput.",
    description:
      "Legacy reserved throughput, billed by provisioned throughput units.",
  },
  {
    label: "Regional Provisioned Throughput",
    option: "Managed compute",
    kind: "Managed compute",
    local: false,
    servingMode: "Provisioned",
    scope: "Region",
    reserved: true,
    available: true,
    description:
      "Reserved throughput in one region, billed by provisioned throughput units (PTUs).",
  },
  {
    label: "Global Provisioned Throughput",
    option: "Managed compute",
    kind: "Managed compute",
    local: false,
    servingMode: "Provisioned",
    scope: "Global",
    reserved: true,
    available: true,
    description:
      "Reserved throughput usable in any region, billed by provisioned throughput units (PTUs).",
  },
  {
    label: "Data Zone Provisioned Throughput",
    option: "Managed compute",
    kind: "Managed compute",
    local: false,
    servingMode: "Provisioned",
    scope: "Data Zone",
    reserved: true,
    available: true,
    description:
      "Reserved throughput processed within one data zone, billed by provisioned throughput units (PTUs).",
  },
  {
    label: "Global Managed Compute",
    option: "Managed compute",
    kind: "Managed compute",
    local: false,
    servingMode: "Dedicated",
    scope: "Global",
    available: true,
    description:
      "A dedicated model instance that stays resident, billed per instance.",
  },
  {
    label: "VM Managed Compute",
    option: "Managed compute",
    kind: "Managed compute",
    local: false,
    servingMode: "Dedicated",
    scope: "Region",
    available: false,
    unavailableReason:
      "Runs on an Azure VM managed by Foundry. Register a runtime node to approximate it.",
    description:
      "Managed compute running on an Azure VM, billed per model instance.",
  },
  {
    label: "Dedicated",
    option: "Managed compute",
    kind: "Managed compute",
    local: false,
    servingMode: "Dedicated",
    scope: "Region",
    available: true,
    description:
      "Dedicated capacity reserved for a single workload, kept resident in one region.",
  },
  {
    label: "Arc",
    option: "Managed compute",
    kind: "Managed compute",
    local: false,
    servingMode: "Dedicated",
    scope: "Region",
    available: false,
    unavailableReason:
      "Requires an Azure Arc-connected machine. Register a runtime node to approximate it.",
    description:
      "Runs on Azure Arc-connected infrastructure.",
  },
  {
    label: "Local Provisioned Throughput",
    option: "Foundry Local on Devices",
    kind: "Managed compute",
    local: true,
    servingMode: "Instant",
    scope: "Device",
    available: true,
    description:
      "Runs on this computer with local capacity, kept ready for instant use. No cloud region, quota or bill.",
  },
];

export const LOCAL_DEPLOYMENT_TYPE = "Local Provisioned Throughput";

/**
 * The deploy UI presents deployment types in three honest layers instead of
 * one flat list copied from Foundry:
 *
 *   - `local`    Runs on this computer, for free, with real token counts.
 *   - `simulate` Runs here too, but reproduces a cloud deployment's limits so
 *                you can test against production behaviour.
 *   - `export`   Needs infrastructure this computer cannot provide; it exists
 *                only as a target to hand off to a cloud.
 */
export type DeploymentLayer = "local" | "simulate" | "export";

export interface DeploymentLayerGroup {
  layer: DeploymentLayer;
  title: string;
  hint: string;
  types: DeploymentType[];
}

const DEPLOYMENT_LAYER_COPY: Record<
  DeploymentLayer,
  { title: string; hint: string }
> = {
  local: {
    title: "Runs on this computer",
    hint: "Free and immediate. Real token counts, no cloud.",
  },
  simulate: {
    title: "Simulate a production deployment",
    hint: "Runs here with cloud-like limits, rate caps and queues.",
  },
  export: {
    title: "Cloud-only SKUs",
    hint: "Not runnable here — these map to a cloud target.",
  },
};

/** Assigns every type to exactly one layer. */
export function deploymentLayerFor(type: DeploymentType): DeploymentLayer {
  if (type.local) return "local";
  if (!type.available) return "export";
  return "simulate";
}

/** Types grouped into Local, Simulate and Export, in that order. */
export function deploymentTypesByLayer(): DeploymentLayerGroup[] {
  const order: DeploymentLayer[] = ["local", "simulate", "export"];
  return order.map((layer) => ({
    layer,
    ...DEPLOYMENT_LAYER_COPY[layer],
    types: DEPLOYMENT_TYPES.filter((type) => deploymentLayerFor(type) === layer),
  }));
}

const BY_LABEL = new Map(
  DEPLOYMENT_TYPES.map((type) => [type.label.toLowerCase(), type])
);

/** Resolves a label, including legacy values stored by older openFoundry builds. */
export function deploymentTypeFor(label: string | undefined): DeploymentType {
  const key = (label || "").trim().toLowerCase();
  if (key === "local managed compute" || key === "local gpu" || key === "")
    return BY_LABEL.get(LOCAL_DEPLOYMENT_TYPE.toLowerCase())!;
  return BY_LABEL.get(key) ?? BY_LABEL.get(LOCAL_DEPLOYMENT_TYPE.toLowerCase())!;
}

export function isKnownDeploymentType(label: string): boolean {
  const key = label.trim().toLowerCase();
  if (key === "local managed compute" || key === "local gpu") return true;
  return BY_LABEL.has(key);
}

/** True when openFoundry can reproduce the type on this computer. */
export function isAvailableDeploymentType(label: string): boolean {
  return deploymentTypeFor(label).available;
}

/** Types grouped exactly the way the Foundry catalog groups them. */
export function deploymentTypesByOption(): {
  option: DeploymentOption;
  types: DeploymentType[];
}[] {
  const order: DeploymentOption[] = [
    "Serverless API",
    "Managed compute",
    "Foundry Local on Devices",
    "Foundry Local on Azure Local",
  ];
  return order
    .map((option) => ({
      option,
      types: DEPLOYMENT_TYPES.filter((type) => type.option === option),
    }))
    .filter((group) => group.types.length > 0);
}

export interface ServingModeInfo {
  label: ServingMode;
  summary: string;
}

/** Copy for the serving-mode axis, shown in the deployment detail panel. */
export const SERVING_MODES: ServingModeInfo[] = [
  {
    label: "Standard",
    summary: "On-demand, metered per token with a tokens-per-minute rate limit.",
  },
  {
    label: "Provisioned",
    summary: "Reserved concurrency slots with a queue, sized by provisioned units.",
  },
  { label: "Batch", summary: "Asynchronous jobs served from a queue." },
  { label: "Developer", summary: "Evaluation-only access with a low rate limit." },
  { label: "Instant", summary: "Kept resident on this computer for immediate use." },
  { label: "Dedicated", summary: "A dedicated, always-resident model instance." },
];

export interface ScopeInfo {
  label: DeploymentScope;
  summary: string;
  simulated: boolean;
}

/** Copy for the scope axis. Residency is the one part that stays simulated. */
export const DEPLOYMENT_SCOPES: ScopeInfo[] = [
  {
    label: "Global",
    summary: "May route to any online runtime. No residency guarantee.",
    simulated: true,
  },
  {
    label: "Data Zone",
    summary: "Routes only within one data zone (US, EU or APAC).",
    simulated: true,
  },
  {
    label: "Region",
    summary: "Pinned to a single runtime node / region.",
    simulated: true,
  },
  {
    label: "Device",
    summary: "Served by this computer.",
    simulated: false,
  },
];

export function servingModeInfo(mode: ServingMode): ServingModeInfo {
  return SERVING_MODES.find((item) => item.label === mode) || SERVING_MODES[0];
}

export function scopeInfo(scope: DeploymentScope): ScopeInfo {
  return DEPLOYMENT_SCOPES.find((item) => item.label === scope) || DEPLOYMENT_SCOPES[0];
}
