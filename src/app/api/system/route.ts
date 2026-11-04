// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextResponse } from "next/server";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  getAgents,
  getDeployments,
  getKnowledgeBases,
  getTraces,
} from "@/lib/store";
import { getProviders } from "@/lib/providers";
import { SystemStats } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

async function diskUsage(): Promise<{ total: number; free: number }> {
  try {
    const { stdout } = await execFileAsync("df", ["-k", process.cwd()]);
    const line = stdout.trim().split("\n").pop() || "";
    const parts = line.split(/\s+/);
    return {
      total: Number(parts[1] || 0) * 1024,
      free: Number(parts[3] || 0) * 1024,
    };
  } catch {
    return { total: 0, free: 0 };
  }
}

export async function GET() {
  const [agents, deployments, knowledge, traces, providers, disk] =
    await Promise.all([
      getAgents(),
      getDeployments(),
      getKnowledgeBases(),
      getTraces(),
      getProviders(),
      diskUsage(),
    ]);
  const stats: SystemStats = {
    now: new Date().toISOString(),
    hostname: os.hostname().replace(/\.local$/, ""),
    platform: `${os.type()} ${os.release()}`,
    release: os.release(),
    cpuModel: os.cpus()[0]?.model || "Apple Silicon",
    cpuCount: os.cpus().length,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    loadAvg: os.loadavg(),
    uptime: os.uptime(),
    disk,
    node: process.version,
    agents: agents.length,
    deployments: deployments.length,
    knowledgeBases: knowledge.length,
    traces: traces.length,
    tokens: deployments.reduce((sum, item) => sum + item.tokens, 0),
  };
  return NextResponse.json({ stats, providers });
}
