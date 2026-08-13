"use client";

import { useState } from "react";

import type { Account, Observation } from "@/lib/signals/types";

import { SectionTitle } from "./ui";

/**
 * Paste your own observations.
 *
 * Two rules borrowed from Day 001's paste panel, both of which matter more than they look:
 *
 * - **Validation happens on the server**, through `POST /api/board` — the same Zod schema that
 *   guards the API. The client does not keep a second copy of the schema that could drift.
 * - **A rejected paste cannot replace a working dataset.** The board is only swapped after the
 *   route has accepted the payload, so a bad paste leaves you looking at the same board you
 *   had a moment ago rather than an empty one.
 *
 * No CSV, deliberately. Header mapping and type coercion are Day 003 `lead-cleaner`; the moment
 * this panel starts inferring columns, it has become that project.
 */

interface Issue {
  path: string;
  message: string;
}

const EXAMPLE = `{
  "accounts": [
    { "id": "x1", "name": "Yours Inc", "domain": "yours.example",
      "industry": "Software", "fit": { "score": 80, "band": "strong" } }
  ],
  "observations": [
    { "account_id": "x1", "observed_at": "2026-06-01",
      "state": { "headcount": 100, "funding_stage": "seed", "funding_total_usd": 4000000,
                 "stack": ["Rivalytics"], "execs": [], "tagline": "A tagline",
                 "homepage_hash": "h1", "pricing_page_hash": "p1" },
      "items": [] },
    { "account_id": "x1", "observed_at": "2026-08-01",
      "state": { "headcount": 140, "funding_stage": "series_a", "funding_total_usd": 26000000,
                 "stack": [], "execs": [{ "fn": "engineering", "title": "VP Engineering" }],
                 "tagline": "A new tagline", "homepage_hash": "h2", "pricing_page_hash": "p1" },
      "items": [{ "kind": "job_post", "observed_at": "2026-07-20",
                  "title": "Staff Data Engineer", "department": "Data", "location": null }] }
  ]
}`;

export function PastePanel({
  watchlist,
  asOf,
  onAccept,
  onReset,
  replaced,
}: {
  watchlist: unknown;
  asOf: string;
  onAccept: (next: { accounts: Account[]; observations: Observation[] }) => void;
  onReset: () => void;
  replaced: boolean;
}) {
  const [text, setText] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit() {
    setChecking(true);
    setError(null);
    setIssues([]);

    let parsed: { accounts?: Account[]; observations?: Observation[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("That is not valid JSON.");
      setChecking(false);
      return;
    }

    try {
      const response = await fetch("/api/board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accounts: parsed.accounts ?? [],
          observations: parsed.observations ?? [],
          watchlist,
          as_of: asOf,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "The server rejected that.");
        setIssues(body.issues ?? []);
        return;
      }

      // Accepted by the same validator the API uses, so it is safe to adopt.
      onAccept({ accounts: parsed.accounts ?? [], observations: parsed.observations ?? [] });
      setText("");
    } catch {
      setError("The request failed.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <details className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <summary className="cursor-pointer">
        <SectionTitle hint="Two observations of the same account are the minimum — one snapshot has nothing to compare against and produces no signals at all.">
          Bring your own observations
        </SectionTitle>
      </summary>

      <div className="mt-3 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={EXAMPLE}
          className="w-full rounded border border-slate-200 bg-transparent p-2 font-mono text-[11px] dark:border-slate-700"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={checking || text.trim().length === 0}
            onClick={submit}
            className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {checking ? "Validating…" : "Score this instead"}
          </button>
          <button
            type="button"
            onClick={() => setText(EXAMPLE)}
            className="text-[11px] text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200"
          >
            Fill with an example
          </button>
          {replaced ? (
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200"
            >
              Back to the bundled dataset
            </button>
          ) : null}
        </div>

        {error ? <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p> : null}
        {issues.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {issues.map((issue, index) => (
              <li key={`${issue.path}-${index}`} className="text-[11px] text-rose-600 dark:text-rose-400">
                <span className="font-mono">{issue.path || "(root)"}</span> — {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-[11px] text-slate-500">
          Validated by <code className="font-mono">POST /api/board</code>, the same schema the API
          uses. A rejected paste leaves the current board exactly as it was. No CSV here on purpose
          — header mapping and type coercion belong to Day 003{" "}
          <code className="font-mono">lead-cleaner</code>.
        </p>
      </div>
    </details>
  );
}
