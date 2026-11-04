// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { Blocklist, Guardrail, GuardrailControl } from "./types";

/**
 * Local Guardrails engine.
 *
 * Foundry guardrails attach a set of controls to agents and models. Locally the
 * controls are enforced two ways: instructions are added to the system prompt,
 * and a deterministic classifier blocks the clearest violations at the declared
 * intervention point (user input / output / tool call). This keeps the same job
 * — reduce safety and security risk — while everything runs on this computer.
 */

export type InterventionPoint = "input" | "output" | "tool";

export interface GuardrailVerdict {
  blocked: boolean;
  control?: GuardrailControl;
  reason?: string;
}

const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) (instructions|prompts|rules)/i,
  /disregard (your|the) (instructions|guidelines|rules)/i,
  /you are now (?:dan|jailbroken|unrestricted|in developer mode)/i,
  /pretend (?:you have|to have) no (?:restrictions|rules|filters)/i,
  /reveal (?:your )?(?:system prompt|hidden instructions|initial prompt)/i,
  /act as (?:an? )?(?:unfiltered|uncensored|unrestricted)/i,
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

const PROTECTED_CODE_PATTERNS: RegExp[] = [
  /\b(?:reproduce|print|output) the (?:full |complete )?(?:licensed |proprietary )?source code of\b/i,
];

const PII_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "email address", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { label: "phone number", re: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { label: "government id", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { label: "credit card number", re: /\b(?:\d[ -]*?){13,16}\b/ },
];

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

function matches(controlId: string, text: string): string | undefined {
  switch (controlId) {
    case "jailbreak":
      return JAILBREAK_PATTERNS.some((re) => re.test(text))
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
    case "protected-material-code":
    case "protected-material-text":
      return PROTECTED_CODE_PATTERNS.some((re) => re.test(text))
        ? "protected material"
        : undefined;
    case "pii": {
      const hit = PII_PATTERNS.find((pattern) => pattern.re.test(text));
      return hit ? `personal data (${hit.label})` : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Evaluate text at a given intervention point. Blocklists are checked first so
 * custom terms always win, then the prompt/pattern controls.
 */
export function evaluate(
  guardrail: Guardrail | undefined,
  blocklists: Blocklist[],
  text: string,
  point: InterventionPoint
): GuardrailVerdict {
  if (!guardrail || !text) return { blocked: false };
  const controls = controlsFor(guardrail, point);
  if (controls.length === 0) return { blocked: false };

  const lower = text.toLowerCase();
  for (const control of controls) {
    if (control.id === "blocklists") {
      const hit = blocklists
        .flatMap((list) => list.terms)
        .find((term) => term && lower.includes(term.toLowerCase()));
      if (hit) {
        return {
          blocked: true,
          control,
          reason: `It matched the blocklist term “${hit}”.`,
        };
      }
      continue;
    }
    if (control.id === "egress-rules" || control.id === "spotlighting") continue;
    if (control.id === "indirect-prompt-injection") {
      if (/^\s*(?:system|assistant)\s*:/im.test(text) || /<\|.*?\|>/.test(text)) {
        return {
          blocked: true,
          control,
          reason: "It looks like an injected instruction.",
        };
      }
      continue;
    }
    const found = matches(control.id, text);
    if (found) {
      return { blocked: true, control, reason: `It contains ${found}.` };
    }
  }
  return { blocked: false };
}

/** Turn the enabled controls into system-prompt instructions. */
export function guardrailInstructions(guardrail?: Guardrail): string {
  const controls = activeControls(guardrail);
  if (controls.length === 0) return "";
  const names = controls.map((control) => control.riskType).join(", ");
  return [
    `Guardrail “${guardrail?.name}” is active. Apply these controls at the stated intervention points: ${names}.`,
    "Refuse requests that facilitate violence, self-harm, illegal activity, hate or sexual content involving minors. Do not fabricate private personal data.",
  ].join(" ");
}

/** The canned refusal returned when a control blocks a turn. */
export function refusalMessage(control: GuardrailControl): string {
  return `This request was blocked by the “${control.riskType}” guardrail control. If you believe this is a mistake, adjust the guardrail under Build → Guardrails.`;
}
