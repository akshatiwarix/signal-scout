import { compareDates, daysBetween, latest } from "../dates";
import { count, decimal } from "../format";
import type { Detection, Evidence, Signal, Thresholds, Watchlist } from "../types";

/**
 * Turns detections into signals.
 *
 * Every detector re-runs at every crawl, so an account that posted one job in March
 * produces a detection in March and, if nothing changes, again in April and May. Without
 * an identity rule the board becomes a duplicate farm and the score inflates purely as a
 * function of how often the crawler ran — which is the most embarrassing possible bug in
 * a signal product, because it looks like signal.
 *
 * Identity is `account : type : subject`, where subject is the thing the signal is
 * *about* — a tool name, a function, a funding stage, `headcount`, `positioning`. Three
 * things can happen when the same identity is detected again:
 *
 * 1. **Inside the refractory window** → fold. Another `evidence[]` entry, and for arrival
 *    signals the anchor advances, which is the mechanism keeping an ongoing surge hot.
 *    A state delta's `changed_at` never moves: the round did not close again.
 * 2. **Materially escalated** (magnitude up by `escalation_factor` or more) → re-fire as a
 *    new occurrence with a fresh anchor and a `#n` suffix. Four job posts becoming
 *    fourteen is not more evidence of the same thing; it is a bigger thing.
 * 3. **Outside the refractory window** → new occurrence. A re-detection months later is a
 *    separate event that happens to look the same.
 */

interface Occurrence {
  detections: Detection[];
  index: number;
}

function evidenceKey(entry: Evidence): string {
  return `${entry.observed_at}|${entry.note}`;
}

function mergeEvidence(occurrence: Occurrence): Evidence[] {
  const seen = new Map<string, Evidence>();
  for (const detection of occurrence.detections) {
    for (const entry of detection.evidence) seen.set(evidenceKey(entry), entry);
  }
  return [...seen.values()].sort((a, b) => compareDates(a.observed_at, b.observed_at));
}

function lastEvidenceDate(occurrence: Occurrence): string | null {
  return latest(mergeEvidence(occurrence).map((entry) => entry.observed_at));
}

function magnitudeOf(occurrence: Occurrence): number | null {
  let best: number | null = null;
  for (const detection of occurrence.detections) {
    if (detection.magnitude === null) continue;
    if (best === null || detection.magnitude > best) best = detection.magnitude;
  }
  return best;
}

function isEscalation(occurrence: Occurrence, next: Detection, thresholds: Thresholds): boolean {
  const previous = magnitudeOf(occurrence);
  if (previous === null || previous === 0 || next.magnitude === null) return false;
  return next.magnitude / previous >= thresholds.escalation_factor;
}

/** Distance from the occurrence's freshest evidence to the new detection's sighting. */
function daysSinceLastEvidence(occurrence: Occurrence, next: Detection): number {
  const last = lastEvidenceDate(occurrence) ?? occurrence.detections[0]?.noticed_at;
  if (!last) return 0;
  return Math.abs(daysBetween(last, next.anchor_at));
}

function toSignal(occurrence: Occurrence, watchlist: Watchlist): Signal {
  const first = occurrence.detections[0];
  if (!first) throw new Error("occurrence with no detections");

  const evidence = mergeEvidence(occurrence);
  const magnitude = magnitudeOf(occurrence);
  const baseKey = `${first.account_id}:${first.type}:${first.subject}`;
  const key = occurrence.index === 0 ? baseKey : `${baseKey}#${occurrence.index + 1}`;

  // The anchor is where the asymmetry lives. An arrival's freshness is its most recent
  // evidence; a state change's is the moment it could first have happened, and no
  // amount of re-observing moves that.
  const anchor_at =
    first.anchor === "last_evidence_at"
      ? (latest([first.anchor_at, ...evidence.map((entry) => entry.observed_at)]) ?? first.anchor_at)
      : first.anchor_at;

  const magnitudeWeight = watchlist.weights[first.weight_key];
  const raw = first.direction === "negative" ? -magnitudeWeight : magnitudeWeight;

  const folded = occurrence.detections.length - 1;
  const foldNote =
    folded > 0
      ? ` — re-observed at ${count(folded)} later ${folded === 1 ? "crawl" : "crawls"}${
          first.anchor === "last_evidence_at" ? ", still producing evidence" : ", unchanged"
        }`
      : "";

  const escalationNote =
    occurrence.index > 0 && magnitude !== null
      ? ` — re-fired as occurrence ${count(occurrence.index + 1)} at magnitude ${decimal(magnitude)}`
      : "";

  // The freshest detection carries the most current phrasing of the same story.
  const newest = occurrence.detections[occurrence.detections.length - 1] ?? first;

  return {
    key,
    account_id: first.account_id,
    type: first.type,
    family: first.family,
    subject: first.subject,
    direction: first.direction,
    weight_key: first.weight_key,
    raw,
    anchor: first.anchor,
    anchor_at,
    known_within_days: first.known_within_days,
    magnitude,
    evidence,
    detail: `${newest.detail}${foldNote}${escalationNote}`,
  };
}

export interface IdentifiedSignals {
  signals: Signal[];
  /** Detections a detector deliberately declined, one per identity, with its reason. */
  rejected: { signal: Signal; reason: string }[];
}

export function assignIdentity(
  detections: Detection[],
  watchlist: Watchlist,
): IdentifiedSignals {
  const groups = new Map<string, Detection[]>();
  for (const detection of detections) {
    const key = `${detection.account_id}:${detection.type}:${detection.subject}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(detection);
    else groups.set(key, [detection]);
  }

  const signals: Signal[] = [];
  const rejected: { signal: Signal; reason: string }[] = [];

  for (const bucket of groups.values()) {
    const ordered = [...bucket].sort((a, b) => compareDates(a.noticed_at, b.noticed_at));
    const occurrences: Occurrence[] = [];

    for (const detection of ordered) {
      const open = occurrences[occurrences.length - 1];

      if (!open) {
        occurrences.push({ detections: [detection], index: 0 });
        continue;
      }

      if (
        isEscalation(open, detection, watchlist.thresholds) ||
        daysSinceLastEvidence(open, detection) > watchlist.thresholds.refractory_days
      ) {
        occurrences.push({ detections: [detection], index: occurrences.length });
        continue;
      }

      open.detections.push(detection);
    }

    for (const occurrence of occurrences) {
      const signal = toSignal(occurrence, watchlist);
      const reason = occurrence.detections[0]?.rejected ?? null;
      if (reason) rejected.push({ signal, reason });
      else signals.push(signal);
    }
  }

  return { signals, rejected };
}
