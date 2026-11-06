# Real guardrails — 2026-11-06

The guardrail engine is now a real deterministic classifier with PII and
credential handling, not a prompt-only mock. It follows the same ideas as the
LangChain guardrail middleware: detect at input/output/tool boundaries, apply a
per-control strategy, and never rely on the model to police itself.

Reference: <https://docs.langchain.com/oss/python/langchain/guardrails#guardrails>

## What is enforced

`src/lib/guardrails.ts` now implements:

- Unicode NFKC normalization and zero-width character removal before matching.
- Jailbreak and injected-instruction patterns, including spaced-out variants
  (`i g n o r e   p r e v i o u s ...`).
- Hate, self-harm, violence, sexual-content and protected-material checks.
- Custom blocklist terms with normalization.
- PII detection:
  - email
  - credit cards, **Luhn validated**
  - government IDs
  - phone numbers
  - IPv4 and MAC addresses
- Credential detection:
  - API keys (`sk-`, `ghp_`, `AKIA`, etc.)
  - bearer tokens
  - JWTs
  - private-key blocks
- Per-control strategies: **block, redact, mask, hash**.
- PII in **tool arguments is blocked**, because redacting arbitrary JSON would
  silently change the call.
- PII in tool output is filtered before it enters the conversation.
- PII output controls buffer the model response so the sensitive text is not
  streamed to the client before the check.
- A dry-run API and a **Test** tab in `/build/guardrails` show findings and the
  transformed text.

The chat route uses the same `evaluate()` engine for input, tool-call and output
checks. This is not a separate demo path.

## Live evidence

`live-guardrail.json` and `guardrails-test.png`:

```json
{
  "redact_input": {
    "blocked": false,
    "text": "Email [REDACTED_EMAIL] and card [REDACTED_CREDIT_CARD].",
    "findings": ["personal data (email)", "personal data (credit card)"]
  },
  "jailbreak": {
    "blocked": true,
    "reason": "It contains a jailbreak attempt."
  },
  "tool_pii": {
    "blocked": true,
    "reason": "It contains personal data (email)."
  }
}
```

The screenshot shows the Test tab with the PII guardrail, two findings and the
redacted text.

## Honest limits

- The pattern checks are deterministic and real, but they are not a semantic
  safety classifier. Novel paraphrases can evade regexes. A model-based
  classifier is a separate layer and is not implemented here.
- PII detection covers the common structured types above. It does not detect
  names, addresses or arbitrary unstructured PII.
- Human-in-the-loop approval for destructive tool calls is **not** implemented.
  The LangChain docs describe that middleware pattern; openFoundry currently
  blocks policy violations and limits tool rounds, but it does not pause a tool
  for a human decision.
- Output buffering is enabled for PII output controls. Other output categories
  are checked after streaming and append a refusal notice; they are not
  stream-safe in the same way.
- The engine is local and deterministic; it does not call Azure Content Safety
  or any external moderation service.

## Tests

The full Vitest suite is **217 passed with 1 skipped (37 files)**.
`tests/guardrails.test.ts` (12 tests) covers:

- email and Luhn-valid card redaction,
- block strategy,
- invalid-card rejection,
- mask and deterministic hash,
- API-key/bearer-token detection,
- spaced-out jailbreak detection,
- zero-width blocklist matching,
- tool-argument PII blocking,
- output-buffering detection,
- the dry-run route permission,
- credential instructions.
