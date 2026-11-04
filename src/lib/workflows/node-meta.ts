// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { WorkflowNode, WorkflowNodeType } from "@/lib/types";

export const NODE_TITLES: Record<WorkflowNodeType, string> = {
  start: "Start",
  agent: "Agent",
  setVariable: "Set variable",
  resetVariable: "Reset variable",
  parseValue: "Parse value",
  ifElse: "If / else condition",
  forEach: "For each",
  goTo: "Go to node",
  sendMessage: "Send message",
  askQuestion: "Ask a question",
  end: "End",
  note: "Note",
};

export interface PaletteItem {
  type: WorkflowNodeType;
  label: string;
  description: string;
  group: "Invoke" | "Data transformation" | "Flow" | "Basics";
}

export const NODE_PALETTE: PaletteItem[] = [
  {
    type: "agent",
    label: "Agent",
    description: "Use an agent to complete tasks.",
    group: "Invoke",
  },
  {
    type: "setVariable",
    label: "Set variable",
    description: "Set a variable value.",
    group: "Data transformation",
  },
  {
    type: "resetVariable",
    label: "Reset variable",
    description: "Reset the value of a variable.",
    group: "Data transformation",
  },
  {
    type: "parseValue",
    label: "Parse value",
    description: "Convert one data type into another.",
    group: "Data transformation",
  },
  {
    type: "ifElse",
    label: "If / else",
    description: "Add conditional logic branching.",
    group: "Flow",
  },
  {
    type: "forEach",
    label: "For each",
    description: "Run a node for each item in a collection.",
    group: "Flow",
  },
  {
    type: "goTo",
    label: "Go to node",
    description: "Go to a specific node in this workflow.",
    group: "Flow",
  },
  {
    type: "sendMessage",
    label: "Deliver a message",
    description: "Message the user without expecting a reply.",
    group: "Basics",
  },
  {
    type: "askQuestion",
    label: "Ask a question",
    description: "Ask a question and wait for an answer.",
    group: "Basics",
  },
  {
    type: "end",
    label: "End",
    description: "End the workflow.",
    group: "Basics",
  },
];

export function nodeTitle(node: WorkflowNode): string {
  return NODE_TITLES[node.type] ?? "Node";
}

export function defaultNodeData(type: WorkflowNodeType): Record<string, unknown> {
  switch (type) {
    case "agent":
      return {
        agentId: "",
        agentName: "",
        inputMessage: "{System.LastMessage.Text}",
        conversationId: "System.Conversation.Id",
        allowMultiTurn: false,
        allowMultiTurnCondition: "",
        includeInConversation: true,
        outputMessageVariable: "LatestMessage",
        outputJsonVariable: "",
      };
    case "setVariable":
      return { variableName: "", value: "" };
    case "resetVariable":
      return { variableName: "" };
    case "parseValue":
      return { value: "", targetType: "string", variableName: "" };
    case "ifElse":
      return {
        conditions: [{ id: "cond_1", expression: "" }],
      };
    case "forEach":
      return {
        collection: "",
        itemVariable: "Item",
        indexVariable: "Index",
      };
    case "goTo":
      return { targetNodeId: "" };
    case "sendMessage":
      return { message: "" };
    case "askQuestion":
      return {
        question: "",
        variable: "Response",
        inputType: "string",
        choices: [],
      };
    case "end":
      return { message: "" };
    case "note":
      return { text: "" };
    default:
      return {};
  }
}
