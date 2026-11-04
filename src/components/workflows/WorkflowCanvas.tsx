// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import {
  ArrowRepeatAll20Regular,
  ArrowRight20Regular,
  Branch20Regular,
  Chat20Regular,
  Code20Regular,
  Note20Regular,
  PeopleTeam20Regular,
  Play20Regular,
  Send20Regular,
  Stop20Regular,
  TextBulletList20Regular,
} from "@fluentui/react-icons";
import type { WorkflowEdge, WorkflowNode } from "@/lib/types";
import { nodeTitle } from "@/lib/workflows/node-meta";

interface CanvasNodeData extends Record<string, unknown> {
  node: WorkflowNode;
  runStatus?: string;
  selected?: boolean;
}

function NodeIcon({ node }: { node: WorkflowNode }) {
  const props = { width: 18, height: 18 };
  switch (node.type) {
    case "start":
      return <Play20Regular {...props} />;
    case "agent":
      return <PeopleTeam20Regular {...props} />;
    case "setVariable":
    case "resetVariable":
    case "parseValue":
      return <TextBulletList20Regular {...props} />;
    case "ifElse":
      return <Branch20Regular {...props} />;
    case "forEach":
      return <ArrowRepeatAll20Regular {...props} />;
    case "goTo":
      return <ArrowRight20Regular {...props} />;
    case "sendMessage":
      return <Send20Regular {...props} />;
    case "askQuestion":
      return <Chat20Regular {...props} />;
    case "end":
      return <Stop20Regular {...props} />;
    case "note":
      return <Note20Regular {...props} />;
    default:
      return <Code20Regular {...props} />;
  }
}

function subtitle(node: WorkflowNode): string {
  switch (node.type) {
    case "agent":
      return String(node.data.agentName || "Select an agent to invoke");
    case "setVariable":
      return String(node.data.variableName || "Choose a variable");
    case "resetVariable":
      return String(node.data.variableName || "Choose a variable");
    case "parseValue":
      return `${node.data.targetType || "string"} · ${
        node.data.variableName || "Choose a variable"
      }`;
    case "ifElse": {
      const conditions = Array.isArray(node.data.conditions)
        ? (node.data.conditions as { expression?: string }[])
        : [];
      return conditions[0]?.expression
        ? String(conditions[0].expression).slice(0, 46)
        : "Add a condition";
    }
    case "forEach":
      return String(node.data.collection || "Choose a collection");
    case "goTo":
      return String(node.data.targetNodeId || "Choose a target");
    case "sendMessage":
      return String(node.data.message || "Write a message").slice(0, 46);
    case "askQuestion":
      return String(node.data.question || "Write a question").slice(0, 46);
    case "end":
      return "End the workflow";
    case "note":
      return "Note";
    default:
      return "";
  }
}

function WorkflowNodeCard({ data }: { data: CanvasNodeData }) {
  const node = data.node;
  if (node.type === "note") {
    return (
      <div className="workflow-note">
        {String(node.data.text || "Double-click the note in the panel to edit.")}
      </div>
    );
  }
  const isStart = node.type === "start";
  const isEnd = node.type === "end" || node.type === "goTo";
  const conditions = Array.isArray(node.data.conditions)
    ? (node.data.conditions as { id: string; expression?: string }[])
    : [];
  return (
    <div
      className={`workflow-node workflow-node-${node.type}${
        data.selected ? " selected" : ""
      }${data.runStatus ? ` run-${data.runStatus}` : ""}`}
    >
      {!isStart && <Handle type="target" position={Position.Left} />}
      <div className={`workflow-node-icon icon-${node.type}`}>
        <NodeIcon node={node} />
      </div>
      <div className="workflow-node-body">
        <div className="workflow-node-title">{nodeTitle(node)}</div>
        <div className="workflow-node-subtitle">{subtitle(node)}</div>
      </div>
      {data.runStatus && (
        <span className={`workflow-node-run-dot run-${data.runStatus}`} />
      )}
      {!isEnd && node.type !== "ifElse" && node.type !== "forEach" ? (
        <Handle type="source" position={Position.Right} />
      ) : null}
      {node.type === "ifElse" && (
        <div className="workflow-node-branches">
          {conditions.map((condition, index) => (
            <span key={condition.id}>{index === 0 ? "If" : "Else if"}</span>
          ))}
          <span>Else</span>
        </div>
      )}
      {node.type === "ifElse" &&
        conditions.map((condition, index) => (
          <Handle
            key={condition.id}
            id={`if:${condition.id}`}
            type="source"
            position={Position.Right}
            style={{ top: `${28 + index * 22}%` }}
          />
        ))}
      {node.type === "ifElse" && (
        <Handle
          id="else"
          type="source"
          position={Position.Right}
          style={{ top: `${28 + conditions.length * 22}%` }}
        />
      )}
      {node.type === "forEach" && (
        <div className="workflow-node-branches">
          <span>Body</span>
          <span>Done</span>
        </div>
      )}
      {node.type === "forEach" && (
        <>
          <Handle
            id="body"
            type="source"
            position={Position.Right}
            style={{ top: "32%" }}
          />
          <Handle
            id="done"
            type="source"
            position={Position.Right}
            style={{ top: "70%" }}
          />
        </>
      )}
    </div>
  );
}

function NoteNodeCard({ data }: { data: CanvasNodeData }) {
  return (
    <div className="workflow-note">
      {String(data.node.data.text || "Add note text in the panel.")}
    </div>
  );
}

const nodeTypes = {
  workflowNode: WorkflowNodeCard,
  noteNode: NoteNodeCard,
};

export default function WorkflowCanvas({
  nodes,
  edges,
  selectedId,
  runStatuses,
  hideNotes,
  onSelect,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onDeleteNodes,
}: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedId: string | null;
  runStatuses?: Record<string, string>;
  hideNotes: boolean;
  onSelect: (id: string | null) => void;
  onNodesChange: (nodes: WorkflowNode[]) => void;
  onEdgesChange: (edges: WorkflowEdge[]) => void;
  onConnect: (connection: Connection) => void;
  onDeleteNodes: (ids: string[]) => void;
}) {
  const rfNodes: Node<CanvasNodeData>[] = nodes
    .filter((node) => !(hideNotes && node.type === "note"))
    .map((node) => ({
      id: node.id,
      type: node.type === "note" ? "noteNode" : "workflowNode",
      position: node.position,
      data: {
        node,
        runStatus: runStatuses?.[node.id],
        selected: node.id === selectedId,
      },
      selected: node.id === selectedId,
      draggable: true,
      deletable: node.type !== "start",
    }));

  const rfEdges: Edge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    label: edge.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: { stroke: "var(--stroke-2)", strokeWidth: 1.4 },
    labelStyle: { fill: "var(--fg-3)", fontSize: 10 },
  }));

  const handleNodesChange = (changes: NodeChange<Node<CanvasNodeData>>[]) => {
    const relevant = changes.filter(
      (change) => change.type === "position" || change.type === "remove"
    );
    if (!relevant.length) return;
    const next = applyNodeChanges(relevant, rfNodes);
    const removed = nodes
      .filter((node) => !next.some((item) => item.id === node.id))
      .map((node) => node.id);
    if (removed.length) onDeleteNodes(removed);
    onNodesChange(
      nodes
        .filter((node) => !removed.includes(node.id))
        .map((node) => {
          const found = next.find((item) => item.id === node.id);
          return found ? { ...node, position: found.position } : node;
        })
    );
  };

  const handleEdgesChange = (changes: { type: string; id?: string }[]) => {
    const removed = new Set(
      changes.filter((change) => change.type === "remove").map((change) => change.id)
    );
    if (removed.size)
      onEdgesChange(edges.filter((edge) => !removed.has(edge.id)));
  };

  return (
    <div className="workflow-canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_event, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        onNodesDelete={(deleted) =>
          onDeleteNodes(deleted.map((node) => node.id).filter((id) => id !== "start"))
        }
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.25}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
