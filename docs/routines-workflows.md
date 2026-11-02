# Routines and workflows

openFoundry implements routines and workflows as first-class local features. They
are not a visual mock, and they do not depend on Microsoft Foundry's lifecycle or
cloud runtime. The reference product was used as a capability checklist; the
implementation, data model, copy and defaults are openFoundry's own.

## Routines

A routine is **one trigger plus one agent invocation**. It is intentionally
smaller than a workflow.

### Triggers

| Trigger | Behaviour | Local implementation |
| --- | --- | --- |
| Recurring schedule | Five-field CRON with an IANA time zone, minimum five minutes | `cron-parser` + local scheduler |
| One-time schedule | Runs once at a future local date/time, then disables itself | ISO timestamp + scheduler |
| Webhook | External systems POST JSON to a per-routine secret URL | `/api/routine-events/[token]` |
| GitHub issue | Polls a repository for opened/closed issues every 60 seconds | GitHub REST API with optional token |
| Teams message | Requires Microsoft 365 + Entra connector authorization | Shown as unavailable; use the webhook trigger |

The dialog presents the reference's schedule presets exactly: Hourly, Daily,
Weekly, Weekdays, Weekends and Custom CRON. Times are entered in the browser's
time zone and stored with the IANA zone.

### Runs

Every trigger creates a persisted run record:

- queued, running, completed, failed
- trigger source, queued/started/ended timestamps and duration
- input and output
- response ID and trace ID
- error text

The routine detail page polls the run store, supports Test run, Pause/Resume, a
state filter and Last day / 7D / 1M / Custom ranges. Selecting a row opens the
full input, output and error.

### Scheduler

The scheduler starts with the Next.js server (`src/instrumentation.ts`) and
ticks every 20 seconds. It:

- dispatches due schedules and timers
- computes the next schedule occurrence
- disables one-time timers after firing
- catches up overdue schedules once after startup
- serialises model calls so concurrent routines do not compete for the GPU
- marks interrupted runs as failed on startup
- polls GitHub routines at most once per minute

Routines run while openFoundry is running. Closing the app stops local
scheduling. A future background daemon/launch agent can extend this to an
always-on machine, but the in-process scheduler does not pretend to provide it.

## Workflows

A workflow is a graph of nodes with typed variables, branching, loops and
human-in-the-loop pauses. It is stored as JSON and can be exported/imported as
YAML.

### Nodes

| Group | Nodes |
| --- | --- |
| Invoke | Agent |
| Data transformation | Set variable, Reset variable, Parse value |
| Flow | If/else, For each, Go to node |
| Basics | Send/Deliver message, Ask a question, End |
| Support | Note, Start |

An Agent node invokes an existing openFoundry agent with the local model
runtime. It supports an input expression, conversation context, output message
variable, JSON output variable and optional inclusion in the external
conversation.

### Expressions

The expression engine is a safe parser and evaluator — **not** `eval` or
`new Function`. It supports:

- literals: strings, numbers, booleans, blank
- variables such as `Local.Name` and `System.LastMessage.Text`
- property access such as `System.Activity.text`
- comparisons `=`, `<>`, `<`, `>`, `<=`, `>=`
- boolean logic `and`, `or`, `not`, `!`
- arithmetic and `&` concatenation
- `If`, `Text`, `Value`, `Upper`, `Lower`, `Trim`, `Len`, `Concat`,
  `Concatenate`, `Find`, `IsBlank`, `Coalesce`, `First`, `Last`, `CountRows`,
  `JSON`, `StartsWith`, `EndsWith`, `Substitute`, `Now`, `Today`

Fields accept plain text, `{Expression}` templates, or expressions beginning
with `=`. Unsupported functions and syntax fail with a clear error. This is an
openFoundry expression language, not the full Power Fx implementation.

### Execution

The interpreter runs on the server against local agents:

- breadth of the graph is driven by edges and handles
- If/else picks the first true condition, then `else`
- For each iterates a collection; connect the body back to the For each node
- Go to jumps to a node
- Ask a question persists a waiting run and resumes with the user's answer
- End returns the final message
- a 500-step guard prevents runaway loops
- every node execution is recorded with status, duration, input and output

### Preview and runs

Preview starts a real run with the current saved draft, shows the external
conversation, highlights node progress on the canvas and resumes human-in-the-
loop questions. The Traces tab lists runs with node timelines and variables.
Monitor computes real run count, success rate, duration and token totals.
Evaluation links to the local evaluation area; no scores are invented.

### Versions and YAML

The designer autosaves a draft, while **Save** creates an immutable version.
Versions can be restored as a draft. YAML export/import uses the same document
schema; the server validates node/edge references and requires a Start node.

## Data files

All state lives in the workspace `data/` directory:

- `routines.json`
- `routine-runs.json`
- `workflows.json`
- `workflow-runs.json`

No demo records are seeded. Deleting a routine or workflow also deletes its
runs.

## API

```
GET/POST            /api/routines
GET/PATCH/DELETE    /api/routines/[id]
POST                /api/routines/[id]/dispatch
GET                 /api/routines/[id]/runs
POST                /api/routine-events/[token]

GET/POST            /api/workflows
GET/PATCH/DELETE    /api/workflows/[id]
GET/POST            /api/workflows/[id]/runs
GET                 /api/workflows/[id]/runs/[runId]
POST                /api/workflows/[id]/runs/[runId]/resume
POST                /api/workflows/[id]/runs/[runId]/cancel
```

## Verification

`npm test` covers expressions, schedules, trigger validation and template graph
integrity. Browser QA exercised:

- recurring routine creation and a real local-model Test run
- webhook dispatch with a JSON payload
- one-time timer firing and automatic disable
- pause/resume
- sequential workflow with three agents
- human-in-the-loop pause, mismatch retry and confirmation
- group chat looping to its turn limit
- For each iteration and expression templates
- designer save/version, preview, YAML and traces/monitor
