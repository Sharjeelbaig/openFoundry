# Cross-process Responses history — 2026-11-06

Project Responses history now lives in SQLite, not a process-local map:

- File: `data/responses.db`
- Table: `responses(id, items_json, created_at)`
- WAL mode and a 5-second busy timeout for concurrent server processes.
- Last 200 responses are retained.
- `previous_response_id` loads the stored input/function-call history before the
  new request input, so function_call_output follow-ups survive a process
  restart.

## Live restart test

1. Sent a tool-using Responses request through the OpenAI SDK.
2. Received `resp_mw4krkp94fg628` with a `lookup_code` function call.
3. Stopped the Next dev server and started it again.
4. Sent the `function_call_output` follow-up with
   `previous_response_id=resp_mw4krkp94fg628`.

Before restart (`before-restart.json`):

```
response id: resp_mw4krkp94fg628
function call: call_si40wll8 lookup_code {"name":"vault"}
```

After restart (`after-restart.json`):

```
follow-up response: resp_mw4ksqns98a9m5
answer: The code for "vault" is ZX-4417.
```

`restart-summary.txt` records the same result.

## Tests

`tests/response-store.test.ts` saves history, closes the process-local SQLite
connection, deletes the global handle, reopens from disk, and asserts the items
are unchanged. It also checks an unknown id returns null.

The Python live suite still covers streaming tool calls through the same store.
