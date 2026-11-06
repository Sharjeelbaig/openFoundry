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

- The pattern checks are deterministic and real. Novel paraphrases can evade
  regexes. An optional model-based second layer is now implemented in
  `src/lib/guardrail-semantic.ts`; see
  `docs/designs/semantic-guardrail-2026-11-06/`. It is off by default and is not
  Azure Content Safety.
- PII detection covers the common structured types above. It does not detect
  names, addresses or arbitrary unstructured PII.
- Human-in-the-loop approval for destructive tool calls is implemented
  separately from the guardrail engine; see
  `docs/designs/tool-approvals-2026-11-06/`. The chat route pauses before the
  tool executes and waits for a signed-in decision.
- Output buffering is enabled for PII output controls and semantic output
  checks. Other output categories are checked after streaming and append a
  refusal notice; they are not stream-safe in the same way.
- The deterministic engine is local and does not call Azure Content Safety or
  any external moderation service. The optional semantic layer calls a local
  chat model only.

## Tests

The full Vitest suite is **238 passed with 1 skipped (41 files)**.
`tests/guardrails.test.ts` (13 tests) covers:

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
