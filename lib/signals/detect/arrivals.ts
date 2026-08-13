import { daysBetween, latest } from "../dates";
import { count, label, plural } from "../format";
import { functionForTitle } from "../functions";
import {
  SIGNAL_FAMILY,
  type Detection,
  type Evidence,
  type Fn,
  type JobPostItem,
  type Observation,
  type Watchlist,
} from "../types";

/**
 * Detectors over dated items: job posts and releases that appeared since the previous
 * crawl.
 *
 * These anchor decay at `last_evidence_at`, not at the first sighting — the asymmetry
 * that separates this from every feed. A funding round happened once and only gets
 * older; a hiring surge that is *still posting* is still hot, and its freshness is its
 * most recent evidence. Items carry exact dates, so `known_within_days` is always 0
 * here: unlike a state change, there is no window of uncertainty to be honest about.
 */

function jobPosts(observation: Observation): JobPostItem[] {
  return observation.items.filter((item): item is JobPostItem => item.kind === "job_post");
}

function evidenceFor(posts: JobPostItem[]): Evidence[] {
  return posts.map((post) => ({
    observed_at: post.observed_at,
    note: post.department ? `${post.title} (${post.department})` : post.title,
  }));
}

function anchorOf(evidence: Evidence[], fallback: string): string {
  return latest(evidence.map((entry) => entry.observed_at)) ?? fallback;
}

/**
 * A surge is a *rate*, so it is counted over a trailing window rather than per crawl:
 * four posts in one crawl and four in the next are the same surge if the window covers
 * both, and counting per crawl would miss it twice.
 */
function detectHiringSurge(observations: Observation[], watchlist: Watchlist): Detection[] {
  const { surge_min_posts, surge_window_days } = watchlist.thresholds;
  const detections: Detection[] = [];

  for (const observation of observations) {
    const inWindow = observations
      .flatMap(jobPosts)
      .filter((post) => {
        const age = daysBetween(post.observed_at, observation.observed_at);
        return age >= 0 && age <= surge_window_days;
      })
      .sort((a, b) => a.observed_at.localeCompare(b.observed_at));

    if (inWindow.length < surge_min_posts) continue;

    const evidence = evidenceFor(inWindow);
    detections.push({
      account_id: observation.account_id,
      type: "hiring_surge",
      family: SIGNAL_FAMILY.hiring_surge,
      subject: "hiring",
      direction: "positive",
      weight_key: "hiring_surge",
      noticed_at: observation.observed_at,
      anchor: "last_evidence_at",
      anchor_at: anchorOf(evidence, observation.observed_at),
      known_within_days: 0,
      magnitude: inWindow.length,
      evidence,
      detail:
        `${plural(inWindow.length, "job post")} in the ${count(surge_window_days)} days to ` +
        `${observation.observed_at}, against a threshold of ${count(surge_min_posts)}`,
      rejected: null,
    });
  }

  return detections;
}

/**
 * One detection per function per crawl. Posts whose function is not on the watchlist,
 * or whose title cannot be placed at all, are reported as rejected rather than dropped
 * on the floor — a reviewer should be able to see that the engine read the post and
 * decided it did not matter, and to which function it could not assign it.
 */
function detectKeyRoles(observations: Observation[], watchlist: Watchlist): Detection[] {
  const relevant = new Set(watchlist.relevant_functions);
  const detections: Detection[] = [];

  for (const observation of observations) {
    const byFunction = new Map<Fn | null, JobPostItem[]>();
    for (const post of jobPosts(observation)) {
      const fn = functionForTitle(post.title, post.department);
      const bucket = byFunction.get(fn);
      if (bucket) bucket.push(post);
      else byFunction.set(fn, [post]);
    }

    for (const [fn, posts] of byFunction) {
      const evidence = evidenceFor(posts);
      const anchor_at = anchorOf(evidence, observation.observed_at);

      if (fn === null) {
        detections.push({
          account_id: observation.account_id,
          type: "key_role_opened",
          family: SIGNAL_FAMILY.key_role_opened,
          subject: "unplaced",
          direction: "positive",
          weight_key: "key_role_opened",
          noticed_at: observation.observed_at,
          anchor: "last_evidence_at",
          anchor_at,
          known_within_days: 0,
          magnitude: posts.length,
          evidence,
          detail: `${plural(posts.length, "job post")} whose title could not be placed in a function`,
          rejected: "the title keyword table could not assign these posts to a function",
        });
        continue;
      }

      detections.push({
        account_id: observation.account_id,
        type: "key_role_opened",
        family: SIGNAL_FAMILY.key_role_opened,
        subject: fn,
        direction: "positive",
        weight_key: "key_role_opened",
        noticed_at: observation.observed_at,
        anchor: "last_evidence_at",
        anchor_at,
        known_within_days: 0,
        magnitude: posts.length,
        evidence,
        detail: `${plural(posts.length, "open role")} in ${label(fn)}${
          relevant.has(fn) ? ", a function on this watchlist" : ""
        }`,
        rejected: relevant.has(fn)
          ? null
          : `${label(fn)} is not one of the functions on this watchlist`,
      });
    }
  }

  return detections;
}

function detectLaunches(observations: Observation[]): Detection[] {
  const detections: Detection[] = [];

  for (const observation of observations) {
    for (const item of observation.items) {
      if (item.kind !== "release") continue;
      detections.push({
        account_id: observation.account_id,
        type: "product_launch",
        family: SIGNAL_FAMILY.product_launch,
        subject: item.title,
        direction: "positive",
        weight_key: "product_launch",
        noticed_at: observation.observed_at,
        anchor: "last_evidence_at",
        anchor_at: item.observed_at,
        known_within_days: 0,
        magnitude: null,
        evidence: [{ observed_at: item.observed_at, note: item.title }],
        detail: `shipped "${item.title}" on ${item.observed_at}`,
        rejected: null,
      });
    }
  }

  return detections;
}

/**
 * `observations` must already be filtered to `observed_at <= as_of` and sorted.
 *
 * **Items belonging to an account's first crawl are discarded**, which deserves its own
 * defence because these items are individually dated and therefore look usable. At
 * discovery the engine cannot tell "posted since we last looked" from "everything the
 * board has ever listed" — a backlog. Scoring a backlog as arrivals is the same failure
 * as diffing snapshot one against nothing, wearing different clothes: an account looks
 * explosive on the day you start watching it and cools for no reason afterwards.
 *
 * The cost is real and accepted: an account discovered late contributes no arrival
 * signals until its second crawl.
 */
export function detectArrivals(observations: Observation[], watchlist: Watchlist): Detection[] {
  const comparable = observations.map((observation, index) =>
    index === 0 ? { ...observation, items: [] } : observation,
  );

  return [
    ...detectHiringSurge(comparable, watchlist),
    ...detectKeyRoles(comparable, watchlist),
    ...detectLaunches(comparable),
  ];
}
