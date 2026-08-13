"use client";

import { useState } from "react";

import type { Board, BoardRow } from "@/lib/signals/types";

import { StateChip } from "./ui";

/**
 * Fit on one axis, signal on the other.
 *
 * This view is the argument for the decision it visualises. Commercial tools multiply fit by
 * timing into a single number, and the result cannot distinguish "perfect customer, dead
 * quiet" from "on fire, company we can never sell to" — the two accounts land on the same
 * score and get the same treatment, which is wrong in opposite directions. Plot them on two
 * axes and each corner is a different instruction.
 */

const QUADRANTS = [
  {
    key: "act-now",
    title: "Act now",
    hint: "good fit, something is happening",
    style: "border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30",
  },
  {
    key: "nurture",
    title: "Nurture",
    hint: "good fit, nothing happening — not a bin, a waiting list",
    style: "border-slate-300 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/40",
  },
  {
    key: "disqualify",
    title: "Loud, wrong company",
    hint: "plenty of signal, poor fit — the reason not to multiply the two",
    style: "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20",
  },
  {
    key: "ignore",
    title: "Ignore",
    hint: "poor fit, quiet",
    style: "border-slate-200 bg-transparent dark:border-slate-800",
  },
] as const;

function quadrantOf(row: BoardRow, actNowAt: number): (typeof QUADRANTS)[number]["key"] {
  const goodFit = row.account.fit.band === "strong";
  const loud = row.total >= actNowAt;
  if (goodFit && loud) return "act-now";
  if (goodFit) return "nurture";
  if (loud) return "disqualify";
  return "ignore";
}

export function QuadrantView({ board }: { board: Board }) {
  const [showAll, setShowAll] = useState(false);
  const limit = showAll ? Infinity : 8;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {QUADRANTS.map((quadrant) => {
          // Contracting rows sort to the top of whichever quadrant they land in. A strong-fit
          // account shedding a third of its staff is technically "good fit, quiet", and calling
          // that a nurture candidate without qualification would be bad advice hiding inside a
          // correct classification.
          const rows = board.rows
            .filter((row) => quadrantOf(row, board.act_now_at) === quadrant.key)
            .sort((a, b) => {
              const contracting = Number(b.state === "contracting") - Number(a.state === "contracting");
              return contracting !== 0 ? contracting : b.total - a.total;
            });
          return (
            <section
              key={quadrant.key}
              className={`flex flex-col gap-2 rounded-lg border p-3 ${quadrant.style}`}
            >
              <header className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{quadrant.title}</h3>
                <span className="font-mono text-xs text-slate-500 tabular-nums">{rows.length}</span>
              </header>
              <p className="text-[11px] text-slate-500">{quadrant.hint}</p>
              {rows.length === 0 ? (
                <p className="text-[11px] text-slate-400">Empty at this date.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {rows.slice(0, limit).map((row) => (
                    <li key={row.account.id} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate">{row.account.name}</span>
                      <span className="flex shrink-0 items-baseline gap-1.5">
                        <StateChip state={row.state} />
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          fit {row.account.fit.score}
                        </span>
                        <span
                          className={`w-8 text-right font-mono text-[11px] font-semibold tabular-nums ${
                            row.total < 0 ? "text-rose-600 dark:text-rose-400" : ""
                          }`}
                        >
                          {row.total}
                        </span>
                      </span>
                    </li>
                  ))}
                  {rows.length > limit ? (
                    <li className="text-[11px] text-slate-400">…and {rows.length - limit} more</li>
                  ) : null}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setShowAll((current) => !current)}
        className="self-start text-[11px] text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200"
      >
        {showAll ? "Show fewer per quadrant" : "Show every account"}
      </button>
      <p className="text-[11px] text-slate-500">
        &ldquo;Good fit&rdquo; is the <span className="font-mono">strong</span> band as supplied in
        the data; &ldquo;loud&rdquo; is at or above the act-now line ({board.act_now_at}). Neither
        axis is derived from the other, and nothing here multiplies them. A{" "}
        <span className="font-medium">Contracting</span> chip overrides the quadrant it sits in and
        sorts to the top of it: an account going backwards is not a nurture candidate, however well
        it fits.
      </p>
    </div>
  );
}
