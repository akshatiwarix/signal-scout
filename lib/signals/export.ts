import type { Board } from "./types";

/**
 * Exports. Pure string production, so they live in the engine and are testable without a DOM.
 *
 * `signals.csv` is one row per **live signal**, not per account: the interesting unit for
 * someone checking the work is the signal, and an account-per-row export would have to
 * flatten the arithmetic into a summary — which is the thing this project exists not to do.
 */

const COLUMNS = [
  "account_id",
  "account_name",
  "domain",
  "industry",
  "fit_score",
  "fit_band",
  "account_total",
  "account_state",
  "signal_key",
  "signal_type",
  "family",
  "subject",
  "direction",
  "raw",
  "anchor",
  "anchor_at",
  "age_days",
  "half_life_days",
  "rank_multiplier",
  "points",
  "known_within_days",
  "evidence_count",
  "detail",
] as const;

/** RFC 4180: quote everything that could contain a delimiter, and double any inner quote. */
function cell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function signalsCsv(board: Board): string {
  const lines = [COLUMNS.join(",")];

  for (const row of board.rows) {
    for (const signal of row.signals) {
      lines.push(
        [
          row.account.id,
          row.account.name,
          row.account.domain,
          row.account.industry,
          row.account.fit.score,
          row.account.fit.band,
          row.total,
          row.state,
          signal.key,
          signal.type,
          signal.family,
          signal.subject,
          signal.direction,
          signal.raw,
          signal.anchor,
          signal.anchor_at,
          signal.age_days,
          signal.half_life_days,
          signal.rank_multiplier,
          signal.decayed,
          signal.known_within_days,
          signal.evidence.length,
          signal.detail,
        ]
          .map(cell)
          .join(","),
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function boardJson(board: Board): string {
  return `${JSON.stringify(board, null, 2)}\n`;
}
