"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { CLIENT_ACCOUNTS, CLIENT_OBSERVATIONS } from "@/data/client";
import { DEFAULT_WATCHLIST } from "@/data/presets";
import { boardAt, prepareBoard } from "@/lib/signals";
import { boardJson, signalsCsv } from "@/lib/signals/export";
import type { Account, Iso, Observation, Watchlist } from "@/lib/signals/types";

import { AsOfScrubber } from "./AsOfScrubber";
import { BoardSummary, BoardTable } from "./BoardTable";
import { PastePanel } from "./PastePanel";
import { QuadrantView } from "./QuadrantView";
import { WatchlistPanel } from "./WatchlistPanel";

/**
 * The console. **The engine runs here, in the browser.**
 *
 * That is a deliberate departure from Days 001–004, which posted to a route on every edit. A
 * date scrubber makes that wrong: a request per frame is a stutter per frame. The engine is
 * pure TypeScript with no dependencies, so importing it costs a few kilobytes and buys an
 * instant scrub. `POST /api/board` still exists as the validated surface, and
 * `equivalence.test.ts` is what guarantees the two paths cannot drift apart.
 *
 * Two memos, split along the axis that matters:
 *
 * - `prepareBoard` re-runs when the **watchlist or the dataset** changes, because thresholds
 *   decide what a detector notices at all.
 * - `boardAt` re-runs on every **date** change, which is cheap: detections are already derived,
 *   so this is identity, decay, scoring and ranking over a handful of signals per account.
 */

type Dataset = { accounts: Account[]; observations: Observation[] };

const BUNDLED: Dataset = { accounts: CLIENT_ACCOUNTS, observations: CLIENT_OBSERVATIONS };

function download(name: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function BoardConsole({
  firstCrawl,
  lastCrawl,
  crawlDates,
  defaultAsOf,
  parseAvailable,
}: {
  firstCrawl: Iso;
  lastCrawl: Iso;
  crawlDates: Iso[];
  defaultAsOf: Iso;
  parseAvailable: boolean;
}) {
  const [watchlist, setWatchlist] = useState<Watchlist>(DEFAULT_WATCHLIST);
  const [asOf, setAsOf] = useState<Iso>(defaultAsOf);
  const [dataset, setDataset] = useState<Dataset>(BUNDLED);
  const [view, setView] = useState<"board" | "quadrant">("board");

  // The slider fires faster than a full board rebuild; deferring keeps the thumb attached to
  // the pointer while the table catches up a frame later.
  const deferredAsOf = useDeferredValue(asOf);

  const prepared = useMemo(
    () => prepareBoard({ accounts: dataset.accounts, observations: dataset.observations, watchlist }),
    [dataset, watchlist],
  );

  const board = useMemo(() => boardAt(prepared, deferredAsOf), [prepared, deferredAsOf]);

  const bounds = useMemo(() => {
    if (dataset === BUNDLED) return { first: firstCrawl, last: lastCrawl, crawls: crawlDates };
    const dates = [...new Set(dataset.observations.map((observation) => observation.observed_at))].sort();
    return {
      first: dates[0] ?? firstCrawl,
      last: dates[dates.length - 1] ?? lastCrawl,
      crawls: dates,
    };
  }, [dataset, firstCrawl, lastCrawl, crawlDates]);

  function adopt(next: Dataset) {
    const dates = [...new Set(next.observations.map((observation) => observation.observed_at))].sort();
    setDataset(next);
    // Land on the most recent thing the pasted data knows about, or the scrubber would open
    // outside its own range.
    setAsOf(dates[dates.length - 1] ?? defaultAsOf);
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <WatchlistPanel watchlist={watchlist} parseAvailable={parseAvailable} onChange={setWatchlist} />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <AsOfScrubber
          asOf={asOf}
          first={bounds.first}
          last={bounds.last}
          crawls={bounds.crawls}
          onChange={setAsOf}
        />
        <BoardSummary board={board} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1" role="tablist">
            {(["board", "quadrant"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={view === tab}
                onClick={() => setView(tab)}
                className={`rounded px-2.5 py-1 text-xs ${
                  view === tab
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {tab === "board" ? "Ranked board" : "Fit × signal"}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => download(`board-${board.as_of}.json`, boardJson(board), "application/json")}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400"
            >
              board.json
            </button>
            <button
              type="button"
              onClick={() => download(`signals-${board.as_of}.csv`, signalsCsv(board), "text/csv")}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400"
            >
              signals.csv
            </button>
          </div>
        </div>

        {view === "board" ? <BoardTable board={board} /> : <QuadrantView board={board} />}

        <p className="text-[11px] text-slate-500">
          {board.rows.length} accounts scored out of {board.denominator}. A total near the
          denominator would need every family firing at once, which nothing real does — the top of
          a healthy board sits around a third of it.
        </p>

        <PastePanel
          watchlist={watchlist}
          asOf={asOf}
          replaced={dataset !== BUNDLED}
          onAccept={adopt}
          onReset={() => {
            setDataset(BUNDLED);
            setAsOf(defaultAsOf);
          }}
        />

        <p className="text-[11px] text-slate-400">
          {dataset === BUNDLED ? "Synthetic dataset" : "Your pasted dataset"}:{" "}
          {dataset.accounts.length} account{dataset.accounts.length === 1 ? "" : "s"},{" "}
          {dataset.observations.length} observation{dataset.observations.length === 1 ? "" : "s"}{" "}
          across {bounds.crawls.length} crawl{bounds.crawls.length === 1 ? "" : "s"}. Every event on
          this board was derived by comparing two of them — the input contains no events.
          {bounds.crawls.length < 2
            ? " With a single crawl there is nothing to compare, so nothing fires — which is the cold-start rule, not a bug."
            : ""}
        </p>
      </div>
    </div>
  );
}
