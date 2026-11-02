"use client";
import Select from "@/components/Select";

import Link from "next/link";
import {
  Add20Regular,
  Delete20Regular,
  Dismiss20Regular,
} from "@fluentui/react-icons";
import type { Agent, WorkflowNode } from "@/lib/types";
import { nodeTitle } from "@/lib/workflows/node-meta";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export default function NodeConfigPanel({
  node,
  nodes,
  agents,
  onChange,
  onDelete,
  onClose,
  onRemoveBranch,
}: {
  node: WorkflowNode;
  nodes: WorkflowNode[];
  agents: Agent[];
  onChange: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
  onRemoveBranch: (handle: string) => void;
}) {
  const update = (patch: Record<string, unknown>) =>
    onChange({ ...node.data, ...patch });
  const conditions = Array.isArray(node.data.conditions)
    ? (node.data.conditions as { id: string; expression: string }[])
    : [];

  return (
    <aside className="workflow-panel" aria-label={`${nodeTitle(node)} settings`}>
      <div className="workflow-panel-head">
        <h3>{nodeTitle(node)}</h3>
        <button className="icon-button" onClick={onClose} aria-label="Close panel">
          <Dismiss20Regular />
        </button>
      </div>
      <div className="workflow-panel-body">
        {node.type === "start" && (
          <p className="muted text-13">
            The workflow starts here. The first user message is available as{" "}
            <span className="mono">System.LastMessage.Text</span>.
          </p>
        )}

        {node.type === "agent" && (
          <>
            <Field label="Select an agent" hint="Agents use the local model runtime.">
              <Select
                className="select"
                value={String(node.data.agentId || "")}
                onChange={(event) => {
                  const agent = agents.find((item) => item.id === event.target.value);
                  update({
                    agentId: event.target.value,
                    agentName: agent?.name || "",
                  });
                }}
              >
                <option value="">Select an agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Link
              href="/build/agents"
              target="_blank"
              className="workflow-agent-link"
            >
              Manage or create agents
            </Link>
            {agents.length === 0 && (
              <div className="banner warning">
                No agents exist yet. Create one in Agents, then return here.
              </div>
            )}
            <Field
              label="Input message"
              hint="Expressions use {…} templates or start with =."
            >
              <textarea
                className="textarea"
                rows={3}
                value={String(node.data.inputMessage || "")}
                onChange={(event) => update({ inputMessage: event.target.value })}
              />
            </Field>
            <Field label="Conversation context">
              <Select
                className="select"
                value={String(node.data.conversationId || "System.Conversation.Id")}
                onChange={(event) => update({ conversationId: event.target.value })}
              >
                <option value="System.Conversation.Id">
                  System.Conversation.Id
                </option>
                <option value="">New conversation</option>
              </Select>
            </Field>
            <label className="workflow-check">
              <input
                type="checkbox"
                checked={Boolean(node.data.includeInConversation)}
                onChange={(event) =>
                  update({ includeInConversation: event.target.checked })
                }
              />
              <span>
                Automatically include the agent response in the workflow
                conversation.
              </span>
            </label>
            <label className="workflow-check">
              <input
                type="checkbox"
                checked={Boolean(node.data.allowMultiTurn)}
                onChange={(event) =>
                  update({ allowMultiTurn: event.target.checked })
                }
              />
              <span>Allow multi-turn conversation</span>
            </label>
            <Field
              label="Save output message as"
              hint="The response is always available as Local.LatestMessage."
            >
              <input
                className="input"
                value={String(node.data.outputMessageVariable || "")}
                onChange={(event) =>
                  update({ outputMessageVariable: event.target.value })
                }
                placeholder="LatestMessage"
              />
            </Field>
            <Field label="Save output JSON as">
              <input
                className="input"
                value={String(node.data.outputJsonVariable || "")}
                onChange={(event) =>
                  update({ outputJsonVariable: event.target.value })
                }
                placeholder="Optional variable name"
              />
            </Field>
          </>
        )}

        {(node.type === "setVariable" || node.type === "resetVariable") && (
          <Field label="Variable name" hint="Local variables are prefixed with Local.">
            <input
              className="input"
              value={String(node.data.variableName || "")}
              onChange={(event) => update({ variableName: event.target.value })}
              placeholder="MyVariable"
            />
          </Field>
        )}

        {node.type === "setVariable" && (
          <Field label="To value" hint="Example: Local.Count + 1 or plain text.">
            <textarea
              className="textarea"
              rows={3}
              value={String(node.data.value || "")}
              onChange={(event) => update({ value: event.target.value })}
              placeholder="{System.LastMessage.Text}"
            />
          </Field>
        )}

        {node.type === "parseValue" && (
          <>
            <Field label="Value to parse">
              <textarea
                className="textarea"
                rows={3}
                value={String(node.data.value || "")}
                onChange={(event) => update({ value: event.target.value })}
              />
            </Field>
            <Field label="Target type">
              <Select
                className="select"
                value={String(node.data.targetType || "string")}
                onChange={(event) => update({ targetType: event.target.value })}
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="json">JSON</option>
              </Select>
            </Field>
            <Field label="Save as variable">
              <input
                className="input"
                value={String(node.data.variableName || "")}
                onChange={(event) => update({ variableName: event.target.value })}
                placeholder="ParsedValue"
              />
            </Field>
          </>
        )}

        {node.type === "ifElse" && (
          <>
            <p className="muted text-12">
              Conditions run top to bottom. The first true branch continues; the
              Else branch is used when none match.
            </p>
            {conditions.map((condition, index) => (
              <div className="workflow-condition" key={condition.id}>
                <div className="row between">
                  <span className="field-label">
                    {index === 0 ? "If" : "Else if"}
                  </span>
                  <button
                    className="icon-button small"
                    aria-label="Remove condition"
                    onClick={() => onRemoveBranch(`if:${condition.id}`)}
                  >
                    <Delete20Regular />
                  </button>
                </div>
                <input
                  className="input mono"
                  value={condition.expression}
                  onChange={(event) =>
                    update({
                      conditions: conditions.map((item) =>
                        item.id === condition.id
                          ? { ...item, expression: event.target.value }
                          : item
                      ),
                    })
                  }
                  placeholder="Local.Value = 1"
                />
              </div>
            ))}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                update({
                  conditions: [
                    ...conditions,
                    {
                      id: `cond_${Date.now().toString(36)}`,
                      expression: "",
                    },
                  ],
                })
              }
            >
              <Add20Regular /> Add condition
            </button>
            <div className="workflow-branch-note">
              Connect each branch handle on the node to its next node. The final
              handle is <span className="mono">Else</span>.
            </div>
          </>
        )}

        {node.type === "forEach" && (
          <>
            <Field label="Collection" hint="For example Local.Items or a JSON variable.">
              <input
                className="input mono"
                value={String(node.data.collection || "")}
                onChange={(event) => update({ collection: event.target.value })}
                placeholder="Local.Items"
              />
            </Field>
            <div className="form-grid">
              <Field label="Item variable">
                <input
                  className="input"
                  value={String(node.data.itemVariable || "")}
                  onChange={(event) => update({ itemVariable: event.target.value })}
                  placeholder="Item"
                />
              </Field>
              <Field label="Index variable">
                <input
                  className="input"
                  value={String(node.data.indexVariable || "")}
                  onChange={(event) => update({ indexVariable: event.target.value })}
                  placeholder="Index"
                />
              </Field>
            </div>
            <div className="workflow-branch-note">
              Connect the <span className="mono">Body</span> handle to the first
              node and connect the last body node back to this For each node.
              Connect the <span className="mono">Done</span> handle to continue
              after the loop.
            </div>
          </>
        )}

        {node.type === "goTo" && (
          <Field label="Select action">
            <Select
              className="select"
              value={String(node.data.targetNodeId || "")}
              onChange={(event) => update({ targetNodeId: event.target.value })}
            >
              <option value="">Select a node</option>
              {nodes
                .filter((item) => item.id !== node.id && item.type !== "note")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {nodeTitle(item)} · {item.id}
                  </option>
                ))}
            </Select>
          </Field>
        )}

        {node.type === "sendMessage" && (
          <Field
            label="Message to send"
            hint="Use {Local.Value} or {System.LastMessage.Text} in the text."
          >
            <textarea
              className="textarea"
              rows={5}
              value={String(node.data.message || "")}
              onChange={(event) => update({ message: event.target.value })}
            />
          </Field>
        )}

        {node.type === "askQuestion" && (
          <>
            <Field label="Question">
              <textarea
                className="textarea"
                rows={4}
                value={String(node.data.question || "")}
                onChange={(event) => update({ question: event.target.value })}
              />
            </Field>
            <Field label="Save user response as">
              <input
                className="input"
                value={String(node.data.variable || "")}
                onChange={(event) => update({ variable: event.target.value })}
                placeholder="Response"
              />
            </Field>
            <Field label="Expected input type">
              <Select
                className="select"
                value={String(node.data.inputType || "string")}
                onChange={(event) => update({ inputType: event.target.value })}
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="json">JSON</option>
                <option value="choice">Choice</option>
              </Select>
            </Field>
            {String(node.data.inputType) === "choice" && (
              <Field label="Choices" hint="One choice per line.">
                <textarea
                  className="textarea"
                  rows={3}
                  value={Array.isArray(node.data.choices)
                    ? (node.data.choices as string[]).join("\n")
                    : ""}
                  onChange={(event) =>
                    update({
                      choices: event.target.value
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            )}
          </>
        )}

        {node.type === "end" && (
          <Field
            label="Final message"
            hint="Optional. If empty, the last assistant message is used."
          >
            <textarea
              className="textarea"
              rows={4}
              value={String(node.data.message || "")}
              onChange={(event) => update({ message: event.target.value })}
            />
          </Field>
        )}

        {node.type === "note" && (
          <Field label="Note">
            <textarea
              className="textarea"
              rows={8}
              value={String(node.data.text || "")}
              onChange={(event) => update({ text: event.target.value })}
            />
          </Field>
        )}

        <div className="workflow-panel-meta">
          Node ID <span className="mono">{node.id}</span>
        </div>
      </div>
      <div className="workflow-panel-footer">
        {node.type !== "start" && (
          <button className="btn btn-ghost" onClick={onDelete}>
            <Delete20Regular /> Delete node
          </button>
        )}
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </aside>
  );
}
