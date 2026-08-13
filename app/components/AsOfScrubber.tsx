"use client";

import { addDays, daysBetween } from "@/lib/signals/dates";
import type { Iso } from "@/lib/signals/types";

/**
 * The hero control. Everything on the board is a pure function of this date, so dragging it is
 * the whole demonstration: a funding round fires at full weight, halves, and vanishes at the
 * horizon while a hiring surge that keeps posting stays hot the entire time.
 *
 * It scrubs **days**, not crawls. Continuous movement is what makes decay look like decay
 * rather than a series of steps, and it is only affordable because the engine runs locally —
 * a request per frame would make this unusable.
 */
export function AsOfScrubber({
  asOf,
  first,
  last,
  crawls,
  onChange,
}: {
  asOf: Iso;
  first: Iso;
  last: Iso;
  crawls: Iso[];
  onChange: (next: Iso) => void;
}) {
  const span = daysBetween(first, last);
  const position = daysBetween(first, asOf);
  const nextCrawl = crawls.find((crawl) => crawl >= asOf);
  const lastCrawl = [...crawls].reverse().find((crawl) => crawl <= asOf);

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <label htmlFor="as-of" className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            As of
          </label>
          <output htmlFor="as-of" className="font-mono text-lg font-semibold tabular-nums">
            {asOf}
          </output>
        </div>
        <p className="text-[11px] text-slate-500">
          {lastCrawl ? (
            <>
              last crawl <span className="font-mono">{lastCrawl}</span>
              {daysBetween(lastCrawl, asOf) > 0 ? ` · ${daysBetween(lastCrawl, asOf)}d of pure ageing since` : " · fresh"}
            </>
          ) : (
            "before the first crawl — nothing has been observed yet"
          )}
          {nextCrawl && nextCrawl !== asOf ? (
            <>
              {" · next "}
              <span className="font-mono">{nextCrawl}</span>
            </>
          ) : null}
        </p>
      </div>

      <div className="relative pt-1 pb-4 text-slate-900 dark:text-slate-100">
        <input
          id="as-of"
          type="range"
          className="scrubber w-full"
          min={0}
          max={span}
          step={1}
          value={position}
          onChange={(event) => onChange(addDays(first, Number(event.target.value)))}
          aria-valuetext={asOf}
        />
        {/* Crawl ticks: the days the engine actually learned something. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-2 h-2">
          {crawls.map((crawl) => (
            <span
              key={crawl}
              title={`crawl ${crawl}`}
              className="absolute top-0 h-2 w-px bg-slate-300 dark:bg-slate-600"
              style={{ left: `calc(${(daysBetween(first, crawl) / span) * 100}% )` }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
          <span>{first}</span>
          <span>{last}</span>
        </div>
      </div>
    </section>
  );
}
