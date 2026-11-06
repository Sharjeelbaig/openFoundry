# A2A endpoint — 2026-11-06

The app now publishes an Agent2Agent (A2A) JSON-RPC endpoint for its agents.

## Discovery

- Standard path: `GET /.well-known/agent-card.json[?agent=<id>]`
- Also served at: `GET /api/a2a/agent-card[?agent=<id>]`
- `?agent` is optional; the first configured agent is used when omitted.
- The card follows A2A 0.3 (`url`, `preferredTransport`, `protocolVersion`) and
  also carries `supportedInterfaces` for newer clients.

Agent card from the live server:

```json
{
  "protocolVersion": "0.3.0",
  "name": "test",
  "url": "http://localhost:3000/api/a2a?agent=test",
  "preferredTransport": "JSONRPC",
  "capabilities": { "streaming": false, "pushNotifications": false },
  "skills": [{ "id": "chat", "name": "test", "tags": ["chat", "text"] }],
  "securitySchemes": { "bearerAuth": { "type": "http", "scheme": "bearer" } }
}
```

## Endpoint and auth

- JSON-RPC endpoint: `POST /api/a2a?agent=<id>`
- Token: `POST /api/a2a/token` (requires a signed-in session, action `chat.use`)
- Requests use `Authorization: Bearer <token>`.
- Issuing a new token invalidates the previous one; only its SHA-256 hash is
  stored in `data/service-mcp-tokens.json`.

The bearer is checked before JSON-RPC parsing, so discovery is public but
message execution is not.

## Methods

| Method | Result |
| --- | --- |
| `message/send` (A2A 0.3) | A2A `Message` with `kind: "message"`, `role: "agent"`, `parts: [{kind:"text",text}]` |
| `SendMessage` (A2A 1.0 alias) | `{ "message": ... }` with `role: "ROLE_AGENT"` and untyped text parts |
| `message/stream` / `SendStreamingMessage` | JSON-RPC `-32004` `UnsupportedOperationError`; streaming is not advertised |
| `tasks/get`, `tasks/cancel` | `-32001` Task not found; this endpoint returns direct messages |

The agent runs through the same `/api/chat` runtime as the builder and
OpenAI-compatible endpoints, so instructions, tools, knowledge bases, guardrails
and traces are the real configured behaviour, not a separate echo handler.

## Live evidence

| File | Call |
| --- | --- |
| `agent-card.json` | `GET /.well-known/agent-card.json` (default agent `test`) |
| `message-send.json` | real `message/send` through a temporary `a2a-live-temp` agent using `gemma4:31b-cloud` |
| `unauthorized.json` | no bearer -> HTTP 401 |

The live send returned:

```json
{
  "kind": "message",
  "role": "agent",
  "contextId": "a2a-demo",
  "parts": [{
    "kind": "text",
    "text": "The Agent2Agent protocol is a standardized communication framework designed to enable autonomous AI agents to discover, negotiate, and exchange data or services with one another."
  }],
  "metadata": {
    "model": "gemma4:31b-cloud",
    "promptTokens": 109,
    "completionTokens": 31,
    "latencyMs": 2438
  }
}
```

A live `SendMessage` call also returned `role: "ROLE_AGENT"` with
`parts: [{ "text": "OK." }]`. The temporary agent used for the live call was
deleted afterwards, and the issued tokens were removed.

## Client example

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/a2a/token \
  -H "Cookie: of_session=<session>" | jq -r .token)

curl -s -X POST "http://localhost:3000/api/a2a?agent=<agent-id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "role": "user",
        "messageId": "m1",
        "parts": [{ "kind": "text", "text": "Hello" }]
      }
    }
  }'
```
