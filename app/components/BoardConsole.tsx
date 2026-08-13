"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { CLIENT_ACCOUNTS, CLIENT_OBSERVATIONS } from "@/data/client";
import { DEFAULT_WATCHLIST } from "@/data/presets";
import { boardAt, prepareBoard } from "@/lib/signals";
import type { Account, Iso, Observation, Watchlist } from "@/lib/signals/types";

import { AsOfScrubber } from "./AsOfScrubber";
import { BoardSummary, BoardTable } from "./BoardTable";
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
  const [dataset, setDataset] = useState<{ accounts: Account[]; observations: Observation[] }>({
    accounts: CLIENT_ACCOUNTS,
    observations: CLIENT_OBSERVATIONS,
  });

  // The slider fires faster than a full board rebuild; deferring keeps the thumb attached to
  // the pointer while the table catches up a frame later.
  const deferredAsOf = useDeferredValue(asOf);

  const prepared = useMemo(
    () => prepareBoard({ accounts: dataset.accounts, observations: dataset.observations, watchlist }),
    [dataset, watchlist],
  );

  const board = useMemo(() => boardAt(prepared, deferredAsOf), [prepared, deferredAsOf]);

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <WatchlistPanel watchlist={watchlist} parseAvailable={parseAvailable} onChange={setWatchlist} />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <AsOfScrubber
          asOf={asOf}
          first={firstCrawl}
          last={lastCrawl}
          crawls={crawlDates}
          onChange={setAsOf}
        />
        <BoardSummary board={board} />
        <BoardTable board={board} />
        <p className="text-[11px] text-slate-500">
          {board.rows.length} accounts scored out of {board.denominator}. A total near the
          denominator would need every family firing at once, which nothing real does — the top of
          a healthy board sits around a third of it.
        </p>
        <ObservationsNote onReplace={setDataset} />
      </div>
    </div>
  );
}

/**
 * Kept minimal here; the paste panel lands in the next commit. What matters is that replacing
 * the dataset goes through the same `prepareBoard` call as the bundled one, so pasted data has
 * no privileged path.
 */
function ObservationsNote({
  onReplace,
}: {
  onReplace: (next: { accounts: Account[]; observations: Observation[] }) => void;
}) {
  void onReplace;
  return (
    <p className="text-[11px] text-slate-400">
      Synthetic dataset: 40 accounts, {CLIENT_OBSERVATIONS.length} observations across{" "}
      {new Set(CLIENT_OBSERVATIONS.map((observation) => observation.observed_at)).size} crawls. Every
      event on this board was derived by comparing two of them — the input contains no events.
    </p>
  );
}
