// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import type { Routine } from "@/lib/types";
import { dispatchRoutine } from "./engine";
import { mutateRoutines } from "./store";

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  closed_at: string | null;
  user?: { login?: string };
  body?: string | null;
  pull_request?: unknown;
}

function headers(token?: string): HeadersInit {
  const base: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) return { ...base, Authorization: `Bearer ${token}` };
  return base;
}

/**
 * Polls a repository for opened or closed issues. This is a real GitHub API
 * integration, not a simulation. An optional token raises the rate limit and
 * allows private repositories.
 */
export async function pollGitHubRoutine(routine: Routine): Promise<void> {
  if (routine.trigger.type !== "github_issue") return;
  const trigger = routine.trigger;
  const now = new Date();
  const last = trigger.lastPolledAt ? new Date(trigger.lastPolledAt) : null;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (last && last.getTime() > since.getTime()) since.setTime(last.getTime());

  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(
      trigger.owner
    )}/${encodeURIComponent(trigger.repository)}/issues`
  );
  url.searchParams.set("state", "all");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");
  url.searchParams.set("per_page", "50");
  url.searchParams.set("since", since.toISOString());

  let error = "";
  let issues: GitHubIssue[] = [];
  try {
    const response = await fetch(url, {
      headers: headers(trigger.token),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `GitHub returned ${response.status}. ${detail.slice(0, 200)}`
      );
    }
    issues = (await response.json()) as GitHubIssue[];
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : "Could not reach the GitHub API.";
  }

  const seen = new Set(trigger.seenEventIds ?? []);
  const events: GitHubIssue[] = [];
  if (!error) {
    for (const issue of issues) {
      if (issue.pull_request) continue;
      const key = `${issue.id}:${trigger.issueEvent}`;
      if (seen.has(key)) continue;
      const eventAt =
        trigger.issueEvent === "opened" ? issue.created_at : issue.closed_at;
      if (!eventAt) continue;
      if (new Date(eventAt).getTime() < since.getTime()) continue;
      events.push(issue);
      seen.add(key);
    }
  }

  await mutateRoutines(async (routines) => {
    const current = routines.find((item) => item.id === routine.id);
    if (!current || current.trigger.type !== "github_issue") return;
    current.trigger.lastPolledAt = now.toISOString();
    current.trigger.lastPollError = error || undefined;
    current.trigger.seenEventIds = [...seen].slice(-200);
    current.updatedAt = now.toISOString();
  });

  for (const issue of events) {
    await dispatchRoutine(routine, "github_issue", {
      event: trigger.issueEvent,
      repository: `${trigger.owner}/${trigger.repository}`,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      author: issue.user?.login,
      url: issue.html_url,
      body: issue.body,
      createdAt: issue.created_at,
      closedAt: issue.closed_at,
    });
  }
}
