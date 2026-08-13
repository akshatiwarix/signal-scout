import { CRAWL_DATES, DEFAULT_AS_OF, FIRST_CRAWL, LAST_CRAWL } from "@/data/dataset";

import { BoardConsole } from "./components/BoardConsole";

/**
 * A server component with two jobs: validate the bundled dataset and report whether the prose
 * box has a key behind it.
 *
 * Importing `@/data/dataset` is what runs the Zod pass over both JSON files, so a malformed
 * hand-edit fails the render rather than the first request that happens to touch the affected
 * account. The console imports the same files raw, which keeps Zod out of the browser bundle.
 */
export default function Home() {
  const parseAvailable = Boolean(process.env.GEMINI_API_KEY);

  return (
    <main className="mx-auto flex w-full max-w-[110rem] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">SignalScout</h1>
        <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          A priority order over an account list, not a feed. Two observations of the same company
          are compared, the difference becomes a signal, and the signal loses value as it ages —
          so the board answers &ldquo;who do I touch today&rdquo; rather than &ldquo;what happened
          on the internet&rdquo;.
        </p>
        <p className="max-w-3xl text-xs text-slate-500">
          Nothing in the input is labelled. It holds headcounts, funding stages, tool lists, exec
          rosters, page hashes and dated job posts — the things a crawler could have seen on a
          date. Every event on this board was derived by the engine, and every number in an
          expanded row can be checked with a calculator.
        </p>
        <p className="max-w-3xl text-xs text-slate-500">
          Drag the date. A funding round fires at full weight, halves in sixty days and vanishes at
          the horizon; a hiring surge that is <em>still posting</em> stays hot the whole time,
          because a state change ages from the moment it happened and an ongoing pattern ages from
          its most recent evidence. Accounts reorder as you drag.
        </p>
      </header>

      <BoardConsole
        firstCrawl={FIRST_CRAWL}
        lastCrawl={LAST_CRAWL}
        crawlDates={CRAWL_DATES}
        defaultAsOf={DEFAULT_AS_OF}
        parseAvailable={parseAvailable}
      />

      <footer className="border-t border-slate-200 pt-4 text-[11px] text-slate-500 dark:border-slate-800">
        Day 005 of a 100-day build challenge. Synthetic data throughout — every domain uses the
        reserved <code className="font-mono">.example</code> TLD, and the tool names are invented.
        Fit scores arrive as data, as if from Day 001 <code className="font-mono">icp-score</code>,
        and are never blended into the signal number: timing and fit are different questions.
      </footer>
    </main>
  );
}
