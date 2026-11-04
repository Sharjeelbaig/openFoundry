// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { WorkflowEdge, WorkflowNode } from "@/lib/types";

export type WorkflowTemplate =
  | "blank"
  | "sequential"
  | "human-in-loop"
  | "group-chat";

export interface TemplateDefinition {
  template: WorkflowTemplate;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: string[];
}

function node(
  id: string,
  type: WorkflowNode["type"],
  x: number,
  y: number,
  data: Record<string, unknown> = {}
): WorkflowNode {
  return { id, type, position: { x, y }, data };
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string
): WorkflowEdge {
  return { id, source, target, sourceHandle: sourceHandle ?? null, targetHandle: null };
}

function start(x = 0, y = 140) {
  return node("start", "start", x, y);
}

function agent(id: string, x: number, y: number, input: string, first = false) {
  return node(id, "agent", x, y, {
    agentId: "",
    agentName: "",
    inputMessage: input,
    conversationId: "System.Conversation.Id",
    allowMultiTurn: false,
    allowMultiTurnCondition: "",
    includeInConversation: true,
    outputMessageVariable: "LatestMessage",
    outputJsonVariable: "",
    first,
  });
}

function end(id: string, x: number, y: number, message = "") {
  return node(id, "end", x, y, { message });
}

export function buildTemplate(template: WorkflowTemplate): TemplateDefinition {
  if (template === "blank") {
    return {
      template,
      name: "blank-workflow",
      description: "An empty workflow with a Start node.",
      nodes: [start()],
      edges: [],
      variables: [],
    };
  }

  if (template === "sequential") {
    return {
      template,
      name: "sequential-workflow",
      description:
        "Pass the result from one agent to the next in a defined order.",
      nodes: [
        start(),
        agent("agent_1", 240, 140, "{System.LastMessage.Text}", true),
        agent("agent_2", 500, 140, "{Local.LatestMessage}"),
        agent("agent_3", 760, 140, "{Local.LatestMessage}"),
        end("end", 1020, 140, "{Local.LatestMessage}"),
      ],
      edges: [
        edge("e1", "start", "agent_1"),
        edge("e2", "agent_1", "agent_2"),
        edge("e3", "agent_2", "agent_3"),
        edge("e4", "agent_3", "end"),
      ],
      variables: ["LatestMessage"],
    };
  }

  if (template === "human-in-loop") {
    return {
      template,
      name: "human-in-loop-workflow",
      description:
        "Ask the user to confirm their input, then continue or retry based on the answer.",
      nodes: [
        start(0, 180),
        node("set_project", "setVariable", 240, 180, {
          variableName: "OriginalInput",
          value: "System.LastMessage.Text",
        }),
        node("question_confirm", "askQuestion", 480, 180, {
          question: "CONFIRM: Please re-enter your input to confirm",
          variable: "ConfirmedInput",
          inputType: "string",
          choices: [],
        }),
        node("check_completion", "ifElse", 720, 180, {
          conditions: [
            {
              id: "cond_1",
              expression: "Local.ConfirmedInput = Local.OriginalInput",
            },
          ],
        }),
        node("sendActivity_confirmed", "sendMessage", 960, 40, {
          message: "Confirmed. The workflow can continue.",
        }),
        end("end_confirmed", 1200, 40, "{Local.ConfirmedInput}"),
        node("sendActivity_mismatch", "sendMessage", 960, 320, {
          message:
            '"{Local.ConfirmedInput}" does not match the original input of "{Local.OriginalInput}". Please try again.',
        }),
        node("goto_again", "goTo", 1200, 320, {
          targetNodeId: "question_confirm",
        }),
      ],
      edges: [
        edge("e1", "start", "set_project"),
        edge("e2", "set_project", "question_confirm"),
        edge("e3", "question_confirm", "check_completion"),
        edge("e4", "check_completion", "sendActivity_confirmed", "if:cond_1"),
        edge("e5", "sendActivity_confirmed", "end_confirmed"),
        edge("e6", "check_completion", "sendActivity_mismatch", "else"),
        edge("e7", "sendActivity_mismatch", "goto_again"),
      ],
      variables: ["OriginalInput", "ConfirmedInput"],
    };
  }

  return {
    template: "group-chat",
    name: "group-chat-workflow",
    description:
      "Pass control between agents until one marks the task complete or the turn limit is reached.",
    nodes: [
      start(0, 220),
      node("set_turns", "setVariable", 240, 220, {
        variableName: "TurnCount",
        value: "0",
      }),
      agent("agent_a", 480, 220, "{System.LastMessage.Text}", true),
      agent("agent_b", 740, 220, "{Local.LatestMessage}"),
      node("inc_turns", "setVariable", 1000, 220, {
        variableName: "TurnCount",
        value: "Local.TurnCount + 1",
      }),
      node("check_done", "ifElse", 1260, 220, {
        conditions: [
          {
            id: "cond_1",
            expression:
              '!IsBlank(Find("[COMPLETE]", Upper(Local.LatestMessage)))',
          },
          {
            id: "cond_2",
            expression: "Local.TurnCount >= 4",
          },
        ],
      }),
      end("end_done", 1520, 40, "{Local.LatestMessage}"),
      node("send_limit", "sendMessage", 1520, 220, {
        message: "The turn limit was reached before the agents finished.",
      }),
      end("end_limit", 1780, 220, ""),
      node("goto_again", "goTo", 1520, 400, {
        targetNodeId: "agent_a",
      }),
    ],
    edges: [
      edge("e1", "start", "set_turns"),
      edge("e2", "set_turns", "agent_a"),
      edge("e3", "agent_a", "agent_b"),
      edge("e4", "agent_b", "inc_turns"),
      edge("e5", "inc_turns", "check_done"),
      edge("e6", "check_done", "end_done", "if:cond_1"),
      edge("e7", "check_done", "send_limit", "if:cond_2"),
      edge("e8", "send_limit", "end_limit"),
      edge("e9", "check_done", "goto_again", "else"),
    ],
    variables: ["TurnCount", "LatestMessage"],
  };
}

export const TEMPLATE_META: {
  template: WorkflowTemplate;
  label: string;
  description: string;
}[] = [
  {
    template: "blank",
    label: "Blank workflow",
    description: "Start from an empty canvas.",
  },
  {
    template: "sequential",
    label: "Sequential",
    description: "Pass one agent's result to the next.",
  },
  {
    template: "human-in-loop",
    label: "Human in Loop",
    description: "Ask a question and branch on the answer.",
  },
  {
    template: "group-chat",
    label: "Group chat",
    description: "Agents take turns until the task is complete.",
  },
];
