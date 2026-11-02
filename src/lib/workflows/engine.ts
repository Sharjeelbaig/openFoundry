import "server-only";
import { completeChat } from "@/lib/chat";
import { appendTrace, getAgent, newId, nowIso } from "@/lib/store";
import type {
  Workflow,
  WorkflowEdge,
  WorkflowFrame,
  WorkflowNode,
  WorkflowNodeRun,
  WorkflowRun,
} from "@/lib/types";
import {
  ExpressionError,
  asBoolean,
  evaluateExpression,
  evaluateTemplate,
  evaluateValue,
  toText,
} from "./expression";
import { nodeTitle } from "./node-meta";
import { getWorkflow, mutateWorkflows, saveWorkflowRun } from "./store";

const MAX_STEPS = 500;

function now(): string {
  return nowIso();
}

function nodeMap(workflow: Workflow): Map<string, WorkflowNode> {
  return new Map(workflow.nodes.map((node) => [node.id, node]));
}

function outgoing(
  workflow: Workflow,
  nodeId: string,
  handle?: string
): WorkflowEdge[] {
  const edges = workflow.edges.filter((edge) => edge.source === nodeId);
  if (handle === undefined) return edges;
  return edges.filter((edge) => (edge.sourceHandle || "") === handle);
}

function nextTarget(
  workflow: Workflow,
  nodeId: string,
  handle?: string
): string | null {
  const edges = outgoing(workflow, nodeId, handle);
  if (handle !== undefined) return edges[0]?.target ?? null;
  return edges[0]?.target ?? null;
}

function setVariable(run: WorkflowRun, name: string, value: unknown): void {
  const key = name.startsWith("Local.") ? name : `Local.${name}`;
  run.variables[key] = value;
}

function deleteVariable(run: WorkflowRun, name: string): void {
  const key = name.startsWith("Local.") ? name : `Local.${name}`;
  delete run.variables[key];
}

function environment(run: WorkflowRun): Record<string, unknown> {
  const lastUser = [...run.messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  return {
    "System.LastMessage.Text": lastUser ?? run.input,
    "System.LastMessageText": lastUser ?? run.input,
    "System.LastMessageId": `msg_${run.messages.length}`,
    "System.Conversation.Id": run.id,
    "System.ConversationId": run.id,
    "System.RunId": run.id,
    "System.InTestMode": true,
    "System.Activity": { text: lastUser ?? run.input },
    ...run.variables,
  };
}

function parseTyped(value: string, type: string): unknown {
  if (type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
      throw new ExpressionError(`"${value}" is not a number.`);
    return parsed;
  }
  if (type === "boolean") {
    if (/^(true|1|yes|y|on)$/i.test(value.trim())) return true;
    if (/^(false|0|no|n|off)$/i.test(value.trim())) return false;
    throw new ExpressionError(`"${value}" is not a boolean.`);
  }
  if (type === "json") {
    try {
      return JSON.parse(value);
    } catch {
      throw new ExpressionError(`"${value}" is not valid JSON.`);
    }
  }
  return value;
}

function startNodeRun(run: WorkflowRun, node: WorkflowNode): WorkflowNodeRun {
  const record: WorkflowNodeRun = {
    nodeId: node.id,
    type: node.type,
    title: nodeTitle(node),
    status: "running",
    startedAt: now(),
  };
  run.nodeRuns.push(record);
  return record;
}

function finishNodeRun(
  record: WorkflowNodeRun,
  patch: Partial<WorkflowNodeRun>
): void {
  record.status = "completed";
  record.endedAt = now();
  record.durationMs =
    new Date(record.endedAt).getTime() - new Date(record.startedAt).getTime();
  Object.assign(record, patch);
}

async function completeRun(
  workflow: Workflow,
  run: WorkflowRun,
  output: string
): Promise<void> {
  run.status = "completed";
  run.output = output;
  run.endedAt = now();
  run.durationMs = new Date(run.endedAt).getTime() - new Date(run.startedAt || run.queuedAt).getTime();
  run.stack = [];
  await saveWorkflowRun(run);
  await mutateWorkflows((workflows) => {
    const workflowItem = workflows.find((item) => item.id === workflow.id);
    if (workflowItem) {
      workflowItem.lastRunAt = run.endedAt;
      workflowItem.updatedAt = run.endedAt || now();
    }
  });
}

async function failRun(run: WorkflowRun, error: unknown): Promise<void> {
  run.status = "failed";
  run.error =
    error instanceof Error ? error.message : "The workflow failed.";
  run.endedAt = now();
  run.durationMs = new Date(run.endedAt).getTime() - new Date(run.startedAt || run.queuedAt).getTime();
  await saveWorkflowRun(run);
}

async function executeRun(workflow: Workflow, run: WorkflowRun): Promise<void> {
  const nodes = nodeMap(workflow);

  try {
    while (run.stack.length > 0) {
      if (run.stepCount >= MAX_STEPS)
        throw new Error(
          `The workflow exceeded ${MAX_STEPS} steps. Check its loops and Go to nodes.`
        );
      run.stepCount += 1;
      const frame = run.stack.pop() as WorkflowFrame;
      if (frame.kind === "forEach") {
        // A forEach frame is only returned to the stack when its body loops.
        run.stack.push(frame);
        continue;
      }

      const node = nodes.get(frame.nodeId);
      if (!node) throw new Error(`Node "${frame.nodeId}" no longer exists.`);
      if (node.type === "note") {
        const target = nextTarget(workflow, node.id);
        if (target) run.stack.push({ kind: "node", nodeId: target });
        continue;
      }

      const record = startNodeRun(run, node);
      const env = environment(run);

      switch (node.type) {
        case "start": {
          finishNodeRun(record, { output: "Workflow started" });
          const target = nextTarget(workflow, node.id);
          if (target) run.stack.push({ kind: "node", nodeId: target });
          break;
        }

        case "agent": {
          const agentId = String(node.data.agentId || "");
          if (!agentId)
            throw new Error(`"${nodeTitle(node)}" has no agent selected.`);
          const agent = await getAgent(agentId);
          if (!agent)
            throw new Error(`The agent for node "${node.id}" was not found.`);

          const inputExpression = String(node.data.inputMessage || "");
          const input = inputExpression
            ? toText(evaluateValue(inputExpression, env))
            : run.input;
          if (!input.trim())
            throw new Error(`Node "${node.id}" has no input message.`);

          const history = run.messages.map((message) => ({
            role: message.role as "user" | "assistant",
            content: message.content,
          }));
          const last = history[history.length - 1];
          if (!last || last.role !== "user" || last.content !== input) {
            history.push({ role: "user", content: input });
          }

          const started = Date.now();
          const result = await completeChat({
            model: agent.model,
            provider: agent.provider,
            messages: [
              { role: "system", content: agent.instructions },
              ...history,
            ],
            temperature: agent.temperature,
            topP: agent.topP,
            maxTokens: agent.maxTokens,
          });
          const durationMs = Date.now() - started;
          run.promptTokens += result.promptTokens;
          run.completionTokens += result.completionTokens;
          // The agent input is internal orchestration. Only the response joins
          // the external workflow conversation, matching the reference's
          // "include agent response" behaviour.
          if (node.data.includeInConversation !== false) {
            run.messages.push({
              role: "assistant",
              content: result.text,
              at: now(),
            });
          }

          const outputVariable = String(
            node.data.outputMessageVariable || "LatestMessage"
          );
          if (outputVariable) setVariable(run, outputVariable, result.text);
          const jsonVariable = String(node.data.outputJsonVariable || "");
          if (jsonVariable) {
            try {
              setVariable(run, jsonVariable, JSON.parse(result.text));
            } catch {
              // Leave the JSON variable unset when the model did not return JSON.
            }
          }

          const traceId = newId("trace");
          run.traceIds.push(traceId);
          await appendTrace({
            id: traceId,
            agentId: agent.id,
            agentName: agent.name,
            prompt: input,
            response: result.text,
            model: agent.model,
            provider: agent.provider,
            latencyMs: durationMs,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            citations: [],
            at: now(),
          });
          finishNodeRun(record, { input, output: result.text });
          const target = nextTarget(workflow, node.id);
          if (target) run.stack.push({ kind: "node", nodeId: target });
          break;
        }

        case "setVariable": {
          const name = String(node.data.variableName || "");
          if (!name) throw new Error("Set variable needs a variable name.");
          const value = evaluateValue(node.data.value, env);
          setVariable(run, name, value);
          finishNodeRun(record, { output: { name, value } });
          const target = nextTarget(workflow, node.id);
          if (target) run.stack.push({ kind: "node", nodeId: target });
          break;
        }

        case "resetVariable": {
          const name = String(node.data.variableName || "");
          if (!name) throw new Error("Reset variable needs a variable name.");
          deleteVariable(run, name);
          finishNodeRun(record, { output: `Reset ${name}` });
          const target = nextTarget(workflow, node.id);
          if (target) run.stack.push({ kind: "node", nodeId: target });
          break;
        }

        case "parseValue": {
          const variable = String(node.data.variableName || "");
          if (!variable) throw new Error("Parse value needs a variable name.");
          const value = parseTyped(
            toText(evaluateValue(node.data.value, env)),
            String(node.data.targetType || "string")
          );
          setVariable(run, variable, value);
          finishNodeRun(record, { output: { variable, value } });
          const target = nextTarget(workflow, node.id);
          if (target) run.stack.push({ kind: "node", nodeId: target });
          break;
        }

        case "ifElse": {
          const conditions = Array.isArray(node.data.conditions)
            ? (node.data.conditions as { id: string; expression: string }[])
            : [];
          let chosen: string | null = null;
          for (const condition of conditions) {
            if (!condition.expression?.trim()) continue;
            const result = asBoolean(
              evaluateExpression(condition.expression, env)
            );
            if (result) {
              chosen = `if:${condition.id}`;
              break;
            }
          }
          if (!chosen) chosen = "else";
          const target = nextTarget(workflow, node.id, chosen);
          finishNodeRun(record, { output: `${nodeTitle(node)} → ${chosen}` });
          if (target) run.stack.push({ kind: "node", nodeId: target });
          break;
        }

        case "forEach": {
          const bodyTarget = nextTarget(workflow, node.id, "body");
          const doneTarget = nextTarget(workflow, node.id, "done");
          if (!bodyTarget && !doneTarget)
            throw new Error("For each needs a body or done connection.");

          const frameIndex = run.stack.findIndex(
            (item) => item.kind === "forEach" && item.nodeId === node.id
          );
          if (frameIndex < 0) {
            const collection = evaluateValue(node.data.collection, env);
            if (!Array.isArray(collection))
              throw new Error("For each needs a collection value.");
            if (collection.length === 0) {
              finishNodeRun(record, { output: "Empty collection" });
              if (doneTarget) run.stack.push({ kind: "node", nodeId: doneTarget });
              break;
            }
            run.stack.push({
              kind: "forEach",
              nodeId: node.id,
              items: collection,
              index: 0,
              itemVariable: String(node.data.itemVariable || "Item"),
              indexVariable: String(node.data.indexVariable || "Index"),
            });
            const frameNew = run.stack[run.stack.length - 1] as Extract<
              WorkflowFrame,
              { kind: "forEach" }
            >;
            setVariable(run, frameNew.itemVariable, collection[0]);
            setVariable(run, frameNew.indexVariable, 0);
            finishNodeRun(record, { output: `Iteration 1 of ${collection.length}` });
            if (bodyTarget) run.stack.push({ kind: "node", nodeId: bodyTarget });
            break;
          }

          const frameExisting = run.stack[frameIndex] as Extract<
            WorkflowFrame,
            { kind: "forEach" }
          >;
          const nextIndex = frameExisting.index + 1;
          if (nextIndex < frameExisting.items.length) {
            frameExisting.index = nextIndex;
            setVariable(
              run,
              frameExisting.itemVariable,
              frameExisting.items[nextIndex]
            );
            setVariable(run, frameExisting.indexVariable, nextIndex);
            finishNodeRun(record, {
              output: `Iteration ${nextIndex + 1} of ${
                frameExisting.items.length
              }`,
            });
            if (bodyTarget) run.stack.push({ kind: "node", nodeId: bodyTarget });
          } else {
            run.stack.splice(frameIndex, 1);
            finishNodeRun(record, { output: "For each complete" });
            if (doneTarget) run.stack.push({ kind: "node", nodeId: doneTarget });
          }
          break;
        }

        case "goTo": {
          const target = String(node.data.targetNodeId || "");
          if (!target) throw new Error("Go to node needs a target node.");
          if (!nodes.has(target))
            throw new Error(`Go to node target "${target}" was not found.`);
          finishNodeRun(record, { output: `Go to ${target}` });
          run.stack.push({ kind: "node", nodeId: target });
          break;
        }

        case "sendMessage": {
          const message = evaluateTemplate(
            String(node.data.message || ""),
            env
          );
          run.messages.push({ role: "assistant", content: message, at: now() });
          run.output = message;
          finishNodeRun(record, { output: message });
          const target = nextTarget(workflow, node.id);
          if (target) run.stack.push({ kind: "node", nodeId: target });
          break;
        }

        case "askQuestion": {
          const question = evaluateTemplate(
            String(node.data.question || ""),
            env
          );
          const variable = String(node.data.variable || "Response");
          const inputType = String(node.data.inputType || "string") as
            | "string"
            | "number"
            | "boolean"
            | "json"
            | "choice";
          const choices = Array.isArray(node.data.choices)
            ? (node.data.choices as string[])
            : [];
          if (inputType === "choice" && choices.length === 0)
            throw new Error("Ask a question needs at least one choice.");
          run.pending = {
            nodeId: node.id,
            question,
            variable,
            inputType,
            choices,
          };
          run.status = "waiting";
          finishNodeRun(record, { output: question });
          const target = nextTarget(workflow, node.id);
          if (target) run.stack.push({ kind: "node", nodeId: target });
          await saveWorkflowRun(run);
          return;
        }

        case "end": {
          const message = String(node.data.message || "")
            ? toText(evaluateValue(node.data.message, env))
            : run.output ||
              [...run.messages].reverse().find((item) => item.role === "assistant")
                ?.content ||
              "";
          finishNodeRun(record, { output: message });
          await completeRun(workflow, run, message);
          return;
        }

        default:
          throw new Error(`Unsupported node type "${node.type}".`);
      }

      await saveWorkflowRun(run);
    }

    const lastAssistant = [...run.messages]
      .reverse()
      .find((message) => message.role === "assistant")?.content;
    await completeRun(workflow, run, lastAssistant || "");
  } catch (error) {
    const active = [...run.nodeRuns]
      .reverse()
      .find((item) => item.status === "running");
    if (active) {
      active.status = "failed";
      active.endedAt = now();
      active.error =
        error instanceof Error ? error.message : "The node failed.";
    }
    await failRun(run, error);
  }
}

export async function startWorkflowRun(
  workflow: Workflow,
  input: string,
  source: "manual" | "preview" = "manual"
): Promise<WorkflowRun> {
  const run: WorkflowRun = {
    id: newId("wrun"),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: "running",
    source,
    queuedAt: now(),
    startedAt: now(),
    input,
    stepCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    variables: {},
    stack: [{ kind: "node", nodeId: "start" }],
    messages: [{ role: "user", content: input, at: now() }],
    nodeRuns: [],
    traceIds: [],
  };
  if (!workflow.nodes.some((node) => node.id === "start"))
    throw new Error("This workflow has no Start node.");
  await saveWorkflowRun(run);
  await executeRun(workflow, run);
  return run;
}

export async function resumeWorkflowRun(
  workflow: Workflow,
  run: WorkflowRun,
  answer: string
): Promise<WorkflowRun> {
  if (run.status !== "waiting" || !run.pending)
    throw new Error("This run is not waiting for an answer.");
  const pending = run.pending;
  if (pending.inputType === "choice" && !pending.choices?.includes(answer))
    throw new Error(`Choose one of: ${pending.choices?.join(", ")}`);

  const value =
    pending.inputType === "string" || pending.inputType === "choice"
      ? answer
      : parseTyped(answer, pending.inputType);
  setVariable(run, pending.variable, value);
  run.messages.push({ role: "user", content: answer, at: now() });
  run.pending = undefined;
  run.status = "running";
  await saveWorkflowRun(run);
  await executeRun(workflow, run);
  return run;
}

export async function cancelWorkflowRun(run: WorkflowRun): Promise<WorkflowRun> {
  if (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled"
  )
    return run;
  run.status = "cancelled";
  run.pending = undefined;
  run.stack = [];
  run.endedAt = now();
  run.durationMs = new Date(run.endedAt).getTime() - new Date(run.startedAt || run.queuedAt).getTime();
  await saveWorkflowRun(run);
  return run;
}

export async function loadWorkflowForRun(id: string): Promise<Workflow | undefined> {
  return getWorkflow(id);
}
