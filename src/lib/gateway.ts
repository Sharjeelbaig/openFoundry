import "server-only";
import { readJson, writeJson } from "./store";
import { GatewayConfig } from "./types";

const DEFAULT: GatewayConfig = {
  enabled: false,
  defaultDeploymentId: "",
  rateLimitPerMinute: 60,
  cacheEnabled: false,
  cacheTtlSeconds: 300,
  routes: [],
  updatedAt: "",
};

export async function getGateway(): Promise<GatewayConfig> {
  const config = await readJson<GatewayConfig>("gateway.json", DEFAULT);
  return { ...DEFAULT, ...config };
}

export async function saveGateway(config: GatewayConfig): Promise<GatewayConfig> {
  const next = { ...config, updatedAt: new Date().toISOString() };
  await writeJson("gateway.json", next);
  return next;
}
