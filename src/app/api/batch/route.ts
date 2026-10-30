import { NextRequest, NextResponse } from "next/server";
import { completeChat } from "@/lib/chat";
import { getDeployments, newId, nowIso, readJson, writeJson } from "@/lib/store";
import { BatchJob } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(): Promise<BatchJob[]> {
  return readJson<BatchJob[]>("batch.json", []);
}

async function save(jobs: BatchJob[]): Promise<void> {
  await writeJson("batch.json", jobs);
}

export async function GET() {
  return NextResponse.json({ jobs: await load() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    deploymentId?: string;
    prompts?: string[];
  };
  if (!body.name || !body.deploymentId || !body.prompts?.length)
    return NextResponse.json(
      { error: "name, deploymentId and prompts are required" },
      { status: 400 }
    );
  const deployments = await getDeployments();
  const deployment = deployments.find((item) => item.id === body.deploymentId);
  if (!deployment)
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });

  const job: BatchJob = {
    id: newId("batch"),
    name: body.name,
    deploymentId: deployment.id,
    deploymentName: deployment.name,
    status: "Running",
    createdAt: nowIso(),
    prompts: body.prompts,
    results: [],
  };
  const jobs = await load();
  jobs.unshift(job);
  await save(jobs);

  void (async () => {
    const current = await load();
    const target = current.find((item) => item.id === job.id);
    if (!target) return;
    for (const prompt of target.prompts) {
      try {
        const result = await completeChat({
          model: deployment.modelId,
          provider: deployment.provider,
          messages: [{ role: "user", content: prompt }],
          maxTokens: 512,
        });
        target.results.push({
          prompt,
          response: result.text,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        });
      } catch (error) {
        target.results.push({
          prompt,
          response: `Failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
          promptTokens: 0,
          completionTokens: 0,
        });
      }
      target.updatedAt = nowIso();
      await save(current);
    }
    target.status = "Completed";
    target.updatedAt = nowIso();
    await save(current);
  })();

  return NextResponse.json({ job }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: "delete";
  };
  if (body.action === "delete") {
    const jobs = await load();
    await save(jobs.filter((item) => item.id !== body.id));
  }
  return NextResponse.json({ ok: true });
}
