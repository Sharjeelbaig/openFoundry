# Human-in-the-loop tool approval — 2026-11-06

openFoundry now pauses a tool call before it runs and waits for a person to
approve or reject it. The chat stream stays open during the pause, so this is a
real stop in the execution path, not a confirmation rendered after the side
effect.

This follows the same idea as LangChain's human-in-the-loop middleware
(<https://docs.langchain.com/oss/python/langchain/guardrails#human-in-the-loop>),
implemented natively because Microsoft Agent Framework and the local HTTP/MCP
tool loop are the core here.

## What happens

1. The model emits a tool call.
2. The deterministic guardrail checks the tool name and arguments.
3. `requiresApproval()` compares the call with the saved policy.
4. If approval is needed, the chat route creates a pending record and sends
   `{"type":"approval_required","approval":{...}}` on the existing SSE stream.
5. The route awaits the decision. The tool does not run.
6. The signed-in person clicks **Approve** or **Reject**, which posts to
   `/api/tool-approvals/:id`.
7. Only an `approved` decision executes the tool. A rejection, timeout or
   closed request records the decision and returns a tool-error message to the
   model.

The same flow is wired into the Playground and the agent Builder chat surfaces.

## Policy

`data/tool-approvals.json` stores the policy and the last 200 decisions. The
API returns only the signed-in person's decisions; the policy is shared.

| Mode | Pauses |
| --- | --- |
| `off` | Nothing |
| `destructive` | MCP tools with `destructiveHint: true`, and HTTP `POST`/`PUT`/`PATCH`/`DELETE` |
| `writes` (default) | Any MCP tool not marked `readOnlyHint: true`, and any non-GET HTTP tool |
| `all` | Every function tool call |

`allowlist` entries match a tool id (`http:http_abc`) or a model-visible
function name. `timeoutSeconds` is clamped to 15–3600 seconds. The policy is
edited under **Build → Guardrails → Tool approvals**.

MCP annotations are read from `tools/list` and persisted with the tool:
`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. When a
server supplies no annotations, the tool is treated as write-capable. HTTP
tools are classified from their method.

## Security properties

- Only the principal who started the run can decide it. The decision endpoint
  checks the session principal before resolving the wait.
- Pending waits are held in memory and expire; a timeout is recorded as
  `expired`, never as success.
- An aborted chat request cancels the pending approval.
- A request without an interactive session (for example an SDK call using an
  agent API key) cannot approve a paused call. The tool is refused with a
  message that says human approval is only available in a signed-in session.
- Decisions are written to `data/audit.jsonl` with the actor, tool, outcome and
  reason.
- The audit copy of arguments redacts keys named like tokens, secrets,
  passwords, authorization or API keys.
- The API routes are guarded by `tools.read`, `tools.write` and `tools.invoke`
  in `src/lib/directory/routes.ts`.

## Live evidence

`live-approval.json` records three runs against a real HTTP `DELETE` tool and a
local recorder:

- **Approve:** the recorder received
  `DELETE /accounts/%20cust-42`, and the tool event was `done`.
- **Reject:** the model was told the call was rejected, and the recorder still
  contained only the first request (`cust-42`, never `cust-99`).
- **Timeout:** with a 15-second policy, the decision event was `expired` after
  17.1 seconds, and the recorder still had only the first request.

`approval-card.png` shows the paused call in the agent Builder.
`policy.png` shows the policy editor and the approved/rejected/expired history.

## Tests

`tests/tool-approvals.test.ts` (9 tests) covers every mode, the allowlist,
defaults, timeout clamping, reason text and route permissions.
`tests/tool-approval-broker.test.ts` (3 tests) covers the real broker: only the
owning principal can decide, an approval and a rejection resolve the wait, a
decision made before the wait begins is not lost, pending records are removed,
and secret-looking argument keys are redacted in the stored history. The live
approve/reject/timeout runs above exercise the chat route end to end.

## Honest limits

- Pending approvals are in memory, so they do not survive a server restart.
  The history still records them as expired.
- The policy is workspace-wide, not per agent or per tool. An allowlist is the
  current per-tool control.
- HTTP method is a heuristic: a `POST` that only reads still asks for approval
  in `writes` mode. MCP servers that publish no annotations are treated as
  write-capable.
- Built-in helpers (`calculator`, `web-search`, `file-search`) are not
  destructive function tools and are not routed through this pause.
- There is no approval queue for an administrator; the person who started the
  run is the approver.
- API-key callers cannot approve. Run agent tools that need approval from the
  interactive Builder or Playground, or add a trusted tool to the allowlist.
