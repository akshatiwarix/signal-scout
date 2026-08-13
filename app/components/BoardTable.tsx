"use client";

import { Fragment, useState } from "react";

import type { Board, BoardRow, DropReason } from "@/lib/signals/types";

import { FAMILY_STYLE, FamilyStrip, FitChip, ScoreBar, Sparkline, StateChip } from "./ui";

/**
 * The ranked board, and the expanded arithmetic under each row.
 *
 * The expansion is the point of the whole project: every number a row shows can be recomputed
 * with a calculator from what is printed beside it. If a change here would make that untrue,
 * it is the wrong change.
 */

const DROP_LABEL: Record<DropReason, string> = {
  past_horizon: "past the horizon",
  rounds_to_zero: "worth less than a point",
  clipped_by_cap: "clipped by the family cap",
  not_relevant: "considered and dismissed",
};

function Evidence({ row }: { row: BoardRow }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          Contributing signals
        </h3>
        {row.signals.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nothing is contributing at this date.
            {row.state === "stale"
              ? " This account was active earlier — see what expired below."
              : " Nothing has ever fired in the window watched."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {row.signals.map((signal) => (
              <li
                key={signal.key}
                className="rounded-md border border-slate-200 p-2.5 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-baseline gap-2">
                    <span className={`text-xs font-semibold ${FAMILY_STYLE[signal.family].text}`}>
                      {FAMILY_STYLE[signal.family].label}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">{signal.type}</span>
                    <span className="text-xs text-slate-700 dark:text-slate-300">{signal.subject}</span>
                  </span>
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      signal.decayed < 0 ? "text-rose-600 dark:text-rose-400" : ""
                    }`}
                  >
                    {signal.decayed > 0 ? "+" : ""}
                    {signal.decayed}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {signal.detail}
                </p>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                    {signal.evidence.length} piece{signal.evidence.length === 1 ? "" : "s"} of evidence
                    {signal.anchor === "last_evidence_at"
                      ? ` · ages from the newest (${signal.anchor_at})`
                      : ` · ages from ${signal.anchor_at}`}
                  </summary>
                  <ul className="mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2.5 dark:border-slate-700">
                    {signal.evidence.map((entry, index) => (
                      <li key={`${entry.observed_at}-${index}`} className="text-[11px] text-slate-500">
                        <span className="font-mono">{entry.observed_at}</span> — {entry.note}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          Considered and excluded ({row.dropped.length})
        </h3>
        {row.dropped.length === 0 ? (
          <p className="text-xs text-slate-500">Nothing was dropped for this account.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {row.dropped.map((entry, index) => (
              <li key={`${entry.signal.key}-${index}`} className="text-[11px] text-slate-500">
                <span className="font-mono text-slate-600 dark:text-slate-400">{entry.signal.type}</span>
                {" · "}
                <span className="text-slate-600 dark:text-slate-400">{entry.signal.subject}</span>
                {" — "}
                <span className="italic">{DROP_LABEL[entry.reason]}</span>: {entry.detail}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          How the total is assembled
        </h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] text-slate-500">
              <th className="py-1 font-medium">Family</th>
              <th className="py-1 text-right font-medium">Points</th>
              <th className="py-1 text-right font-medium">Cap</th>
              <th className="py-1 text-right font-medium">Clipped</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {row.families.map((family) => (
              <tr key={family.family} className="border-t border-slate-100 dark:border-slate-800">
                <td className={`py-1 font-sans ${FAMILY_STYLE[family.family].text}`}>
                  {FAMILY_STYLE[family.family].label}
                </td>
                <td className="py-1 text-right">{family.points}</td>
                <td className="py-1 text-right text-slate-400">{family.cap}</td>
                <td className="py-1 text-right text-slate-400">{family.clipped === 0 ? "—" : family.clipped}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-300 font-semibold dark:border-slate-600">
              <td className="py-1 font-sans">Total</td>
              <td className="py-1 text-right">{row.total}</td>
              <td className="py-1 text-right text-slate-400">{row.denominator}</td>
              <td className="py-1 text-right text-slate-400">—</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1.5 text-[11px] text-slate-500">
          The total is the sum of the family column, floored at −25 and capped at the denominator.
          No division happens anywhere in the scoring path — the caps sum to the denominator by
          construction, which is why there is nothing here to normalise.
        </p>
      </div>
    </div>
  );
}

export function BoardTable({ board }: { board: Board }) {
  const [open, setOpen] = useState<string | null>(null);

  // Family strips are scaled against the loudest row so widths mean something across the
  // board rather than only within a row.
  const loudest = board.rows.reduce(
    (max, row) => Math.max(max, row.families.reduce((sum, f) => sum + Math.abs(f.points), 0)),
    1,
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] tracking-wide text-slate-500 uppercase dark:border-slate-800">
            <th className="w-8 py-2 pr-2 text-right font-medium">#</th>
            <th className="py-2 pr-3 font-medium">Account</th>
            <th className="w-14 py-2 pr-2 text-right font-medium">
              <abbr title="ICP fit, supplied as data — a second axis, never multiplied into the score">
                Fit
              </abbr>
            </th>
            <th className="w-16 py-2 pr-2 text-right font-medium">Signal</th>
            <th className="w-40 py-2 pr-3 font-medium">Score</th>
            <th className="w-28 py-2 pr-3 font-medium">Families</th>
            <th className="w-24 py-2 pr-2 font-medium">State</th>
            <th className="w-20 py-2 pr-2 font-medium">Trend</th>
            <th className="w-8 py-2" aria-label="expand" />
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row, index) => {
            const expanded = open === row.account.id;
            return (
              <Fragment key={row.account.id}>
                <tr
                  onClick={() => setOpen(expanded ? null : row.account.id)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/40"
                >
                  <td className="py-2 pr-2 text-right font-mono text-[11px] text-slate-400 tabular-nums">
                    {index + 1}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="block font-medium">{row.account.name}</span>
                    <span className="block text-[11px] text-slate-500">
                      {row.account.industry} · {row.account.domain}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right">
                    <FitChip band={row.account.fit.band} score={row.account.fit.score} />
                  </td>
                  <td
                    className={`py-2 pr-2 text-right font-mono font-semibold tabular-nums ${
                      row.total < 0 ? "text-rose-600 dark:text-rose-400" : ""
                    }`}
                  >
                    {row.total}
                    <span className="text-[10px] font-normal text-slate-400">/{row.denominator}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <ScoreBar total={row.total} denominator={row.denominator} actNowAt={board.act_now_at} />
                  </td>
                  <td className="py-2 pr-3">
                    <FamilyStrip families={row.families} scaleAgainst={loudest} />
                  </td>
                  <td className="py-2 pr-2">
                    <StateChip state={row.state} />
                  </td>
                  <td className="py-2 pr-2">
                    <span className="flex items-center gap-1.5">
                      <Sparkline points={row.sparkline} total={row.total} />
                      <span
                        className={`font-mono text-[11px] tabular-nums ${
                          row.trend > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : row.trend < 0
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-slate-400"
                        }`}
                      >
                        {row.trend > 0 ? "+" : ""}
                        {row.trend}
                      </span>
                    </span>
                  </td>
                  <td className="py-2 text-center text-slate-400">{expanded ? "▾" : "▸"}</td>
                </tr>
                {expanded ? (
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <td />
                    <td colSpan={8} className="py-3 pr-3">
                      <Evidence row={row} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BoardSummary({ board }: { board: Board }) {
  const items: [string, string, string][] = [
    ["Accounts", String(board.summary.accounts), "in the watched universe"],
    ["Live signals", String(board.summary.live_signals), "inside the horizon at this date"],
    [
      `At or above ${board.act_now_at}`,
      String(board.summary.above_act_now),
      "worth a touch today",
    ],
    ["Contracting", String(board.summary.contracting), "going the wrong way"],
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([term, value, hint]) => (
        <div
          key={term}
          className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
        >
          <dt className="text-[11px] tracking-wide text-slate-500 uppercase">{term}</dt>
          <dd className="font-mono text-xl font-semibold tabular-nums">{value}</dd>
          <dd className="text-[11px] text-slate-500">{hint}</dd>
        </div>
      ))}
    </dl>
  );
}
