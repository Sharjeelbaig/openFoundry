# MCP transports

Date: 2026-11-06

openFoundry's MCP client supports three transports. The third one was added
because Atlassian's remote MCP server uses it, and the client previously failed
with `404 Missing sessionId parameter`.

| Transport | How it works | Examples |
| --- | --- | --- |
| `stdio` | spawn a local process, JSON-RPC over stdin/stdout | filesystem, git |
| `http` | streamable HTTP POST, optional `Mcp-Session-Id` | newer remote servers |
| `sse` | GET opens an event stream, server sends `endpoint`, requests POST there, responses arrive on the stream | Atlassian remote MCP |

Selection is explicit (`transport: "sse"`) or automatic when the URL ends in
`/sse`, so an existing Atlassian configuration works even if it was saved as
`http`.

## Live verification

Created a server record with:

```json
{
  "name": "atlassian-live",
  "transport": "sse",
  "url": "https://mcp.atlassian.com/v1/sse",
  "headers": { "Authorization": "Bearer <temporary API token>" }
}
```

`POST /api/mcp` returned:

```json
{
  "status": "Connected",
  "tools": [
    "getContentFormatGuide",
    "getTeamworkGraphContext",
    "getTeamworkGraphObject",
    "addTeamworkGraphContext"
  ]
}
```

The record was deleted after the test and `data/mcp-servers.json` no longer
contains the token.

## Why the old client failed

Atlassian answers a POST to `/v1/sse` with `404 Missing sessionId parameter`. Its
SSE handshake is a GET that emits:

```
event: endpoint
data: /v1/sse?sessionId=...
```

Only after that can JSON-RPC be POSTed, and the POST returns `202 Accepted` with
the actual response delivered as a `message` event on the open stream. A client
that expects the response in the POST body will always see nothing.

## Tests

`tests/mcp-sse.test.ts` runs a local SSE server and covers:

- initialize and `tools/list` over the stream;
- auto-detection of an `/sse` URL saved as `http`;
- a non-SSE endpoint storing the real error instead of a generic failure.

## Security

Headers are stored on the MCP server record and masked in the API for callers
without `tools.invoke`. A temporary token used for a test should be deleted with
the server and rotated at the provider.
