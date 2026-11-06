// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { createHash } from "crypto";
import { Blocklist, Guardrail, GuardrailControl } from "./types";

/**
 * Local Guardrails engine.
 *
 * This is a real deterministic classifier, not a mock. It combines:
 *
 * - normalized pattern checks for jailbreaks, injected instructions, hate,
 *   self-harm, violence and protected material;
 * - custom blocklists;
 * - PII and credential detection with Luhn validation for card numbers;
 * - per-control block/redact/mask/hash strategies;
 * - input, output and tool-call enforcement points.
 *
 * A model-based safety classifier and human approval for destructive tool calls
 * are separate layers. The engine never claims they are present.
 */

export type InterventionPoint = "input" | "output" | "tool";
export type GuardrailStrategy = "block" | "redact" | "mask" | "hash" | "observe";

export interface GuardrailFinding {
  controlId: string;
  riskType: string;
  category: "pii" | "secret" | "injection" | "content" | "blocklist";
  count: number;
  /** A safe description; never includes the matched secret or PII. */
  detail: string;
}

export interface GuardrailVerdict {
  blocked: boolean;
  control?: GuardrailControl;
  reason?: string;
  /** The input with redact/mask/hash strategies applied where possible. */
  text: string;
  findings: GuardrailFinding[];
}

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

function normalize(text: string): string {
  return text.normalize("NFKC").replace(ZERO_WIDTH, "").toLowerCase();
}

function compact(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, "");
}

const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) (instructions|prompts|rules)/i,
  /disregard (your|the) (instructions|guidelines|rules)/i,
  /you are now (?:dan|jailbroken|unrestricted|in developer mode)/i,
  /pretend (?:you have|to have) no (?:restrictions|rules|filters)/i,
  /reveal (?:your )?(?:system prompt|hidden instructions|initial prompt)/i,
  /act as (?:an? )?(?:unfiltered|uncensored|unrestricted)/i,
];

const COMPACT_JAILBREAK = [
  "ignorepreviousinstructions",
  "ignoreallpreviousinstructions",
  "ignorepriorinstructions",
  "disregardyourinstructions",
  "disregardtheinstructions",
  "revealyoursystemprompt",
  "revealhiddeninstructions",
  "youarenowdan",
  "youarenowjailbroken",
  "developermode",
  "jailbreakmode",
];

const SELF_HARM_PATTERNS: RegExp[] = [
  /\b(?:how (?:can|do) i|ways? to|methods? (?:for|of))\s+(?:kill|hurt|harm) (?:myself|me)\b/i,
  /\bsuicide (?:method|plan|instructions)\b/i,
];

const VIOLENCE_PATTERNS: RegExp[] = [
  /\bhow to (?:make|build) (?:a )?(?:bomb|explosive|molotov)\b/i,
  /\bhow to (?:poison|kill) someone\b/i,
];

const HATE_PATTERNS: RegExp[] = [
  /\b(?:all|every)\s+(?:members of|people from)\s+\w+\s+(?:should|deserve to)\s+(?:die|be killed|be removed)\b/i,
];

const SEXUAL_PATTERNS: RegExp[] = [
  /\b(?:child|minor|underage)\s+(?:sexual|pornographic|explicit)\b/i,
  /\bcsam\b/i,
];

const PROTECTED_CODE_PATTERNS: RegExp[] = [
  /\b(?:reproduce|print|output) the (?:full |complete )?(?:licensed |proprietary )?source code of\b/i,
];

const INJECTION_PATTERNS: RegExp[] = [
  /^\s*(?:system|assistant|developer)\s*:/im,
  /<\|(?:im_start|im_end|system|assistant|user)\|>/i,
  /<\/?(?:system|assistant|developer)>/i,
  /\[(?:system|assistant|developer)\]/i,
  /\b(?:new|updated) (?:system )?instructions?\s*:/i,
];

interface PiiMatch {
  type: string;
  value: string;
  start: number;
  end: number;
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;
const SSN_RE = /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const MAC_RE = /\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b/gi;
const API_KEY_RE =
  /\b(?:sk|pk|ghp|gho|ghu|ghs|github_pat|xox[baprs]|AKIA|ASIA)[A-Za-z0-9_-]{12,}\b/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const PRIVATE_KEY_RE =
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g;

function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function ipv4Valid(value: string): boolean {
  return value
    .split(".")
    .every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function findPii(text: string): PiiMatch[] {
  const found: PiiMatch[] = [];
  const add = (type: string, value: string, start: number) => {
    const end = start + value.length;
    if (
      found.some(
        (existing) => start < existing.end && end > existing.start
      )
    ) {
      return;
    }
    found.push({ type, value, start, end });
  };

  for (const match of text.matchAll(PRIVATE_KEY_RE)) {
    add("private_key", match[0], match.index ?? 0);
  }
  for (const match of text.matchAll(JWT_RE)) {
    add("jwt", match[0], match.index ?? 0);
  }
  for (const match of text.matchAll(API_KEY_RE)) {
    add("api_key", match[0], match.index ?? 0);
  }
  for (const match of text.matchAll(BEARER_RE)) {
    add("bearer_token", match[0], match.index ?? 0);
  }
  for (const match of text.matchAll(EMAIL_RE)) {
    add("email", match[0], match.index ?? 0);
  }
  for (const match of text.matchAll(CARD_RE)) {
    if (luhnValid(match[0])) add("credit_card", match[0], match.index ?? 0);
  }
  for (const match of text.matchAll(SSN_RE)) {
    add("government_id", match[0], match.index ?? 0);
  }
  for (const match of text.matchAll(IPV4_RE)) {
    if (ipv4Valid(match[0])) add("ip_address", match[0], match.index ?? 0);
  }
  for (const match of text.matchAll(MAC_RE)) {
    add("mac_address", match[0], match.index ?? 0);
  }
  for (const match of text.matchAll(PHONE_RE)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      add("phone", match[0], match.index ?? 0);
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

function strategyFor(control: GuardrailControl): GuardrailStrategy {
  const raw = (control.strategy || control.action || "").toLowerCase();
  if (raw.includes("redact") || raw.includes("anonym")) return "redact";
  if (raw.includes("mask")) return "mask";
  if (raw.includes("hash")) return "hash";
  if (raw.includes("block") || raw.includes("deny")) return "block";
  return "observe";
}

function maskValue(match: PiiMatch): string {
  if (match.type === "email") {
    const [local, domain] = match.value.split("@");
    return `${local.slice(0, 1)}***@${domain}`;
  }
  const digits = match.value.replace(/\D/g, "");
  if (match.type === "credit_card") {
    return `**** **** **** ${digits.slice(-4)}`;
  }
  if (match.type === "phone" || match.type === "government_id") {
    return `***-***-${digits.slice(-4)}`;
  }
  if (match.type === "ip_address") {
    const parts = match.value.split(".");
    return `***.***.***.${parts[parts.length - 1]}`;
  }
  if (match.type === "mac_address") {
    return "**:**:**:**:**:**";
  }
  if (match.type === "api_key" || match.type === "bearer_token") {
    return `${match.value.slice(0, 4)}…${match.value.slice(-4)}`;
  }
  return `[MASKED_${match.type.toUpperCase()}]`;
}

function replaceValue(match: PiiMatch, strategy: GuardrailStrategy): string {
  if (strategy === "mask") return maskValue(match);
  if (strategy === "hash") {
    const hash = createHash("sha256").update(match.value).digest("hex");
    return `[${match.type.toUpperCase()}:${hash.slice(0, 12)}]`;
  }
  return `[REDACTED_${match.type.toUpperCase()}]`;
}

function applyPiiStrategy(
  text: string,
  matches: PiiMatch[],
  strategy: GuardrailStrategy
): string {
  let output = text;
  for (const match of [...matches].sort((a, b) => b.start - a.start)) {
    output =
      output.slice(0, match.start) +
      replaceValue(match, strategy) +
      output.slice(match.end);
  }
  return output;
}

function summarizePii(matches: PiiMatch[]): GuardrailFinding[] {
  const counts = new Map<string, number>();
  for (const match of matches) {
    counts.set(match.type, (counts.get(match.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({
    controlId: "pii",
    riskType: "PII",
    category: type === "api_key" || type === "bearer_token" || type === "jwt" || type === "private_key"
      ? "secret"
      : "pii",
    count,
    detail:
      type === "api_key" || type === "bearer_token" || type === "jwt" || type === "private_key"
        ? `credential (${type.replace(/_/g, " ")})`
        : `personal data (${type.replace(/_/g, " ")})`,
  }));
}

export function activeControls(guardrail?: Guardrail): GuardrailControl[] {
  if (!guardrail) return [];
  return guardrail.controls.filter((control) => control.enabled);
}

function controlsFor(
  guardrail: Guardrail | undefined,
  point: InterventionPoint
): GuardrailControl[] {
  const needle =
    point === "input"
      ? /user input/i
      : point === "output"
      ? /output/i
      : /tool/i;
  return activeControls(guardrail).filter((control) => needle.test(control.intervention));
}

function matchesContent(controlId: string, text: string): string | undefined {
  switch (controlId) {
    case "jailbreak":
      return JAILBREAK_PATTERNS.some((re) => re.test(text)) ||
        COMPACT_JAILBREAK.some((phrase) => compact(text).includes(phrase))
        ? "a jailbreak attempt"
        : undefined;
    case "self-harm":
      return SELF_HARM_PATTERNS.some((re) => re.test(text))
        ? "content that promotes self-harm"
        : undefined;
    case "violence":
      return VIOLENCE_PATTERNS.some((re) => re.test(text))
        ? "content that promotes violence"
        : undefined;
    case "hate":
      return HATE_PATTERNS.some((re) => re.test(text))
        ? "hateful content"
        : undefined;
    case "sexual":
      return SEXUAL_PATTERNS.some((re) => re.test(text))
        ? "sexual content involving minors"
        : undefined;
    case "protected-material-code":
    case "protected-material-text":
      return PROTECTED_CODE_PATTERNS.some((re) => re.test(text))
        ? "protected material"
        : undefined;
    case "indirect-prompt-injection":
      return INJECTION_PATTERNS.some((re) => re.test(text)) ||
        JAILBREAK_PATTERNS.some((re) => re.test(text))
        ? "an injected instruction"
        : undefined;
    default:
      return undefined;
  }
}

/**
 * Evaluate text at a given intervention point. Blocklists are checked first so
 * custom terms always win, then PII/secrets, then the pattern controls.
 */
export function evaluate(
  guardrail: Guardrail | undefined,
  blocklists: Blocklist[],
  text: string,
  point: InterventionPoint
): GuardrailVerdict {
  if (!guardrail || !text) {
    return { blocked: false, text, findings: [] };
  }
  const controls = controlsFor(guardrail, point);
  if (controls.length === 0) {
    return { blocked: false, text, findings: [] };
  }

  const findings: GuardrailFinding[] = [];
  let blockedControl: GuardrailControl | undefined;
  let output = text;
  const normalized = normalize(text);

  for (const control of controls) {
    if (control.id === "egress-rules" || control.id === "spotlighting") {
      continue;
    }
    if (control.id === "blocklists") {
      const lower = normalized;
      const hit = blocklists
        .flatMap((list) => list.terms)
        .find((term) => term && lower.includes(normalize(term)));
      if (hit) {
        findings.push({
          controlId: control.id,
          riskType: control.riskType,
          category: "blocklist",
          count: 1,
          detail: "a configured blocklist term",
        });
        blockedControl ||= control;
      }
      continue;
    }
    if (control.id === "pii") {
      const matches = findPii(text);
      if (!matches.length) continue;
      findings.push(...summarizePii(matches));
      const strategy = strategyFor(control);
      if (strategy === "block" || point === "tool") {
        // Tool arguments are JSON; redacting them would change the call in an
        // unpredictable way. Block the call instead.
        blockedControl ||= control;
      } else {
        output = applyPiiStrategy(output, matches, strategy);
      }
      continue;
    }
    const found = matchesContent(control.id, normalized);
    if (found) {
      findings.push({
        controlId: control.id,
        riskType: control.riskType,
        category:
          control.id === "indirect-prompt-injection" || control.id === "jailbreak"
            ? "injection"
            : "content",
        count: 1,
        detail: found,
      });
      blockedControl ||= control;
    }
  }

  const blocked = Boolean(blockedControl);
  const reason = blocked
    ? `It contains ${findings[0]?.detail || "content blocked by the guardrail"}.`
    : undefined;
  return {
    blocked,
    control: blockedControl,
    reason,
    text: blocked ? text : output,
    findings,
  };
}

/** True when output must be buffered so PII is filtered before it reaches the client. */
export function hasOutputStreamGuard(guardrail?: Guardrail): boolean {
  return activeControls(guardrail).some(
    (control) =>
      control.id === "pii" && /output/i.test(control.intervention)
  );
}

/** Guard a tool name and its JSON arguments before the tool is executed. */
export function evaluateToolCall(
  guardrail: Guardrail | undefined,
  blocklists: Blocklist[],
  name: string,
  args: Record<string, unknown>
): GuardrailVerdict {
  return evaluate(
    guardrail,
    blocklists,
    `${name} ${JSON.stringify(args)}`,
    "tool"
  );
}

/** Turn the enabled controls into system-prompt instructions. */
export function guardrailInstructions(guardrail?: Guardrail): string {
  const controls = activeControls(guardrail);
  if (controls.length === 0) return "";
  const names = controls.map((control) => control.riskType).join(", ");
  return [
    `Guardrail “${guardrail?.name}” is active. Apply these controls at the stated intervention points: ${names}.`,
    "Refuse requests that facilitate violence, self-harm, illegal activity, hate or sexual content involving minors. Do not fabricate private personal data.",
    "Never reveal API keys, bearer tokens, private keys or other credentials. If a user asks for personal data, ask them to redact it instead of repeating it.",
  ].join(" ");
}

/** The canned refusal returned when a control blocks a turn. */
export function refusalMessage(control: GuardrailControl): string {
  return `This request was blocked by the “${control.riskType}” guardrail control. If you believe this is a mistake, adjust the guardrail under Build → Guardrails.`;
}
