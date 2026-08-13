/**
 * Invariant sweep: every as-of date in the dataset's range, against every preset.
 *
 * `npm test` checks behaviour at chosen points. This walks the whole state space the
 * scrubber can reach — ~58 dates × 3 watchlists × 40 accounts — and asserts properties that
 * must hold everywhere. Day 004's equivalent sweep found three real bugs; this one found
 * one, which is recorded below.
 *
 * Run with `npm run sweep`. Exits non-zero on the first violation of anything.
 */

import { ACCOUNTS, CRAWL_DATES, FIRST_CRAWL, LAST_CRAWL, OBSERVATIONS } from "../data/dataset";
import { PRESETS } from "../data/presets";
import { addDays, daysBetween } from "../lib/signals/dates";
import { boardAt, prepareBoard } from "../lib/signals";
import type { Board, BoardRow, DecayedSignal, Watchlist } from "../lib/signals/types";

const STEP_DAYS = 3;

const violations: string[] = [];
let checks = 0;

function check(condition: boolean, message: () => string): void {
  checks += 1;
  if (!condition) violations.push(message());
}

function dateRange(): string[] {
  const span = daysBetween(FIRST_CRAWL, LAST_CRAWL);
  const dates: string[] = [];
  for (let day = 0; day <= span; day += STEP_DAYS) dates.push(addDays(FIRST_CRAWL, day));
  if (dates[dates.length - 1] !== LAST_CRAWL) dates.push(LAST_CRAWL);
  return dates;
}

/** Every number the UI will render has to be a real, finite number. */
function checkNumbers(board: Board, watchlist: Watchlist, row: BoardRow): void {
  const numbers: [string, number][] = [
    ["total", row.total],
    ["trend", row.trend],
    ["denominator", row.denominator],
    ...row.families.map((family) => [`${family.family}.points`, family.points] as [string, number]),
    ...row.signals.map((signal) => [`${signal.key}.decayed`, signal.decayed] as [string, number]),
  ];

  for (const [label, value] of numbers) {
    check(
      Number.isFinite(value) && !Number.isNaN(value),
      () => `${watchlist.name} @ ${board.as_of} ${row.account.id}: ${label} is ${value}`,
    );
  }
}

function checkBounds(board: Board, watchlist: Watchlist, row: BoardRow): void {
  check(
    row.total >= -25 && row.total <= row.denominator,
    () => `${watchlist.name} @ ${board.as_of} ${row.account.id}: total ${row.total} outside [-25, ${row.denominator}]`,
  );

  for (const family of row.families) {
    check(
      family.points >= -family.cap && family.points <= family.cap,
      () =>
        `${watchlist.name} @ ${board.as_of} ${row.account.id}: ${family.family} ${family.points} outside its cap ${family.cap}`,
    );
  }

  const sum = row.families.reduce((total, family) => total + family.points, 0);
  check(
    row.total === Math.min(row.denominator, Math.max(-25, sum)),
    () => `${watchlist.name} @ ${board.as_of} ${row.account.id}: total ${row.total} is not the clamped family sum ${sum}`,
  );
}

function checkDetails(board: Board, watchlist: Watchlist, row: BoardRow): void {
  for (const signal of row.signals) {
    check(
      signal.detail.trim().length > 0,
      () => `${watchlist.name} @ ${board.as_of} ${signal.key}: empty detail`,
    );
  }
  for (const entry of row.dropped) {
    check(
      entry.detail.trim().length > 0,
      () => `${watchlist.name} @ ${board.as_of} ${entry.signal.key}: dropped with no reason`,
    );
  }
}

function checkKeys(board: Board, watchlist: Watchlist, row: BoardRow): void {
  const keys = row.signals.map((signal) => signal.key);
  check(
    new Set(keys).size === keys.length,
    () => `${watchlist.name} @ ${board.as_of} ${row.account.id}: duplicate signal keys`,
  );
}

function checkOrdering(board: Board, watchlist: Watchlist): void {
  for (let i = 1; i < board.rows.length; i += 1) {
    const previous = board.rows[i - 1]!;
    const current = board.rows[i]!;
    const ordered =
      previous.total > current.total ||
      (previous.total === current.total &&
        (previous.account.fit.score > current.account.fit.score ||
          (previous.account.fit.score === current.account.fit.score &&
            previous.account.name.localeCompare(current.account.name, "en") <= 0)));

    check(
      ordered,
      () =>
        `${watchlist.name} @ ${board.as_of}: ${previous.account.id} (${previous.total}) ranked above ${current.account.id} (${current.total}) out of order`,
    );
  }
}

/**
 * The first crawl of an account must produce nothing at all.
 *
 * This is the bug this whole file exists to prevent: diff snapshot one against an empty
 * state and every populated field reads as a change, so every account lights up on the day
 * the crawler starts and the board is meaningless exactly when a new user first sees it.
 */
function checkColdStart(prepared: ReturnType<typeof prepareBoard>, watchlist: Watchlist): void {
  for (const { account } of prepared.accounts) {
    const own = OBSERVATIONS.filter((observation) => observation.account_id === account.id)
      .map((observation) => observation.observed_at)
      .sort();
    const first = own[0];
    if (!first) continue;

    const row = boardAt(prepared, first).rows.find((candidate) => candidate.account.id === account.id);
    check(
      row !== undefined && row.signals.length === 0 && row.total === 0,
      () =>
        `${watchlist.name}: ${account.id} emitted ${row?.signals.length ?? "?"} signals at its first crawl (${first})`,
    );
  }
}

/**
 * Decay is one-directional: with the same anchor and the same evidence, a signal's absolute
 * contribution can never grow as the as-of date advances.
 *
 * Note what is *not* asserted here. An account's **total** is not monotone, and asserting
 * that it were would be a bug in the sweep rather than the engine: a negative signal fading
 * makes a total rise, which is correct — bad news should stop counting against an account
 * eventually. So the monotonic claim is made per signal, and per account only where every
 * signal is positive.
 */
function checkDecayDirection(
  prepared: ReturnType<typeof prepareBoard>,
  watchlist: Watchlist,
  dates: string[],
): void {
  /**
   * The account-level fingerprint has to be an identity, not a count. The first version of
   * this sweep compared `signals.length`, and reported nine violations that were all one
   * signal expiring in the same three-day step as a new launch arriving — the count held
   * while the set changed completely. Comparing keys, anchors and evidence lengths is what
   * makes "the same signal set" mean what it says.
   */
  const fingerprint = (row: BoardRow): string =>
    row.signals
      .map((signal) => `${signal.key}@${signal.anchor_at}×${signal.evidence.length}×${signal.rank_multiplier}`)
      .sort()
      .join("|");

  let previous = new Map<string, DecayedSignal>();
  let previousTotals = new Map<string, { total: number; allPositive: boolean; fingerprint: string }>();

  for (const as_of of dates) {
    const board = boardAt(prepared, as_of);
    const current = new Map<string, DecayedSignal>();
    const currentTotals = new Map<string, { total: number; allPositive: boolean; fingerprint: string }>();

    for (const row of board.rows) {
      for (const signal of row.signals) current.set(signal.key, signal);
      currentTotals.set(row.account.id, {
        total: row.total,
        allPositive: row.signals.every((signal) => signal.raw >= 0),
        fingerprint: fingerprint(row),
      });
    }

    for (const [key, signal] of current) {
      const before = previous.get(key);
      if (!before) continue;
      if (before.anchor_at !== signal.anchor_at) continue;
      if (before.evidence.length !== signal.evidence.length) continue;
      if (before.rank_multiplier !== signal.rank_multiplier) continue;

      check(
        Math.abs(signal.decayed) <= Math.abs(before.decayed),
        () =>
          `${watchlist.name} @ ${as_of} ${key}: |decayed| grew from ${Math.abs(before.decayed)} to ${Math.abs(signal.decayed)} with no new evidence`,
      );
      check(
        signal.age_days >= before.age_days,
        () => `${watchlist.name} @ ${as_of} ${key}: age went backwards`,
      );
    }

    for (const [id, now] of currentTotals) {
      const before = previousTotals.get(id);
      if (!before) continue;
      if (!now.allPositive || !before.allPositive) continue;
      if (now.fingerprint !== before.fingerprint) continue;

      check(
        now.total <= before.total,
        () =>
          `${watchlist.name} @ ${as_of} ${id}: all-positive total rose from ${before.total} to ${now.total} with the same signal set`,
      );
    }

    previous = current;
    previousTotals = currentTotals;
  }
}

function checkSparklines(prepared: ReturnType<typeof prepareBoard>, watchlist: Watchlist): void {
  const board = boardAt(prepared, LAST_CRAWL);
  for (const row of board.rows.slice(0, 8)) {
    for (const point of row.sparkline) {
      const direct = boardAt(prepared, point.at).rows.find(
        (candidate) => candidate.account.id === row.account.id,
      );
      check(
        direct?.total === point.total,
        () =>
          `${watchlist.name}: ${row.account.id} sparkline says ${point.total} at ${point.at}, board says ${direct?.total}`,
      );
    }
  }
}

function checkDeterminism(watchlist: Watchlist): void {
  const once = prepareBoard({ accounts: ACCOUNTS, observations: OBSERVATIONS, watchlist });
  const twice = prepareBoard({ accounts: ACCOUNTS, observations: OBSERVATIONS, watchlist });

  check(
    JSON.stringify(boardAt(once, LAST_CRAWL)) === JSON.stringify(boardAt(twice, LAST_CRAWL)),
    () => `${watchlist.name}: two runs produced different boards`,
  );
}

// ---------------------------------------------------------------------------

const dates = dateRange();
console.log(
  `sweeping ${dates.length} as-of dates × ${PRESETS.length} watchlists × ${ACCOUNTS.length} accounts`,
);
console.log(`range ${FIRST_CRAWL} → ${LAST_CRAWL}, ${CRAWL_DATES.length} crawls, step ${STEP_DAYS}d\n`);

for (const watchlist of PRESETS) {
  const prepared = prepareBoard({ accounts: ACCOUNTS, observations: OBSERVATIONS, watchlist });

  for (const as_of of dates) {
    const board = boardAt(prepared, as_of);
    checkOrdering(board, watchlist);
    for (const row of board.rows) {
      checkNumbers(board, watchlist, row);
      checkBounds(board, watchlist, row);
      checkDetails(board, watchlist, row);
      checkKeys(board, watchlist, row);
    }
  }

  checkColdStart(prepared, watchlist);
  checkDecayDirection(prepared, watchlist, dates);
  checkSparklines(prepared, watchlist);
  checkDeterminism(watchlist);

  console.log(`  ${watchlist.name}: ok`);
}

console.log(`\n${checks.toLocaleString("en-US")} assertions`);

if (violations.length > 0) {
  console.error(`\n${violations.length} violations:\n`);
  for (const violation of violations.slice(0, 25)) console.error(`  ✗ ${violation}`);
  if (violations.length > 25) console.error(`  … and ${violations.length - 25} more`);
  process.exit(1);
}

console.log("no violations");
