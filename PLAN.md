# Day 005 — SignalScout — Implementation Plan

Day 005 of a 100-day building challenge. The concept is fixed by the master
backlog (`~/Desktop/100-days-portfolio-execution-plan.md`): *a signal monitoring
concept that surfaces account events that could make outreach timely.* Every
choice below came out of a decision-by-decision interview across five rounds and
is deliberate rather than a default. The 24 settled decisions are recorded at the
bottom; treat them as decided, not as open questions to relitigate.

**Time limit:** one day. Feature-frozen at plan sign-off.

---

## Problem

Every signal tool sells the same promise — *reach out when something changed* —
and almost all of them hand you a feed. A feed is a chronological list of things
that happened to companies, which is the wrong shape for the only question a rep
actually has at 9am: **who do I touch today, and why today rather than last month.**

Four failures follow from the feed shape, and all four are the reason this repo
exists.

**Nothing decays.** A Series B round from February sits in the feed with the same
visual weight in October. But the reason a round is a signal is that budget just
arrived and gets spent over two quarters — the signal *is* the freshness, so a
system that stores events without aging them has thrown away the actual payload.

**Noise compounds instead of saturating.** Six blog posts and a webinar outrank a
new CTO plus a funding round, because the score is a sum and the blog posts are
numerous. Rank by that and the top of your board is whoever publishes most.

**Fit and timing get multiplied into one number.** A 60 that means "perfect
customer, dead quiet" and a 60 that means "on fire, company we can never sell to"
are indistinguishable, so the number stops being actionable and becomes decoration.

**The events are given, not derived.** The feed arrives pre-labeled from a vendor.
Nobody demonstrates the part that is genuinely hard: taking two observations of
the same account at two dates and working out what changed, what that change
means, whether you have seen it already, and how much you are allowed to claim
about *when* it happened when your crawler skipped 90 days.

So the interesting problems are:

- Can every event on the board be **derived** rather than supplied? Does the input
  contain any labels at all, or only what a crawler could have seen on a date?
- Does the same detector firing at six consecutive snapshots produce one signal or six?
- Does a signal that is *still happening* age the same way as one that happened once?
- When the timeline has a hole, what is the tool allowed to assert about freshness?
- Can a reviewer reproduce every number on the board with a calculator?

That is a change-detection problem with a decay model and an explainable score on
top, and it is what this project builds.

## Intended user

A GTM engineer, SDR lead or founder who has an account list and wants a daily
priority order over it — not a news feed. Someone who will ask "why is this
account above that one" and expects an answer in arithmetic.

Secondary user: whoever reads the repo to judge whether the author understands
that monitoring is a stateful problem, or has just rendered a vendor's webhook
payload in a table.

## User journey

1. Land on the app. Bundled dataset, default watchlist, board already ranked —
   no upload, no key, no config, no empty state.
2. Read the board. 40 accounts ordered by signal score, each row showing total,
   the families that contributed, lifecycle state, and a sparkline of that
   account's score over the last six months.
3. Expand a row. Every signal that fired, with its raw weight, its anchor date,
   its age, the half-life applied, and the decayed points — the full arithmetic.
   Below it, the **dropped** panel: signals that existed but fell past the
   horizon, and contributions clipped by a family cap, each with the reason.
4. **Drag the as-of date.** This is the demo. A funding round fires at 25 points,
   halves to 12 by summer, and vanishes at the horizon. A hiring surge that keeps
   posting stays hot the entire time, because arrival signals decay from their
   most recent evidence and state changes decay from the change itself. Accounts
   reorder as you drag.
5. Tune the watchlist on the left: half-lives, family caps, raw weights,
   detector thresholds, which functions you sell to, which tools are competitors
   and which are complements. Board recomputes instantly — locally, no request.
6. Load one of three presets — displacement motion, growth motion, budget motion
   — and watch the same six months produce a different priority order.
7. Switch to the quadrant tab. Fit on one axis, signal on the other. *Act now*,
   *Nurture*, *Disqualify*, *Ignore*. The loud-wrong-company quadrant is the
   argument for never multiplying fit by timing.
8. Export `board.json` or `signals.csv`.
9. Paste your own observations as JSON. Validated at the boundary; a rejected
   paste names the offending field and cannot replace a working dataset.
10. Optional, only with a Gemini key set: describe what you care about in prose
    — *"I sell observability to Series B data teams; I care most when they lose an
    engineering leader or drop a competitor"* — and the watchlist panel fills in.
    You review and edit it before anything is scored.

## MVP scope (user-selected)

**In:**

- Two-shape observation model: scalar state + append-only dated items
- 10 detectors across 5 families, two of them negative
- Stable signal identity, refractory folding, re-fire on material escalation
- Per-family exponential decay with an asymmetric anchor rule
- Family caps summing to 100, in-family diminishing returns, negative floor
- Cold-start baseline rule and honest gap handling (`known_within_days`)
- 6 derived lifecycle states, trailing-window trend, per-account sparkline
- Continuous as-of date scrubber over a ~6-month range
- Watchlist editor + 3 presets covering all 10 detectors
- 40-account synthetic dataset × 8 observation dates, 10 engineered traps
- Fit-vs-signal quadrant view
- Exports: `board.json`, `signals.csv`
- Paste-JSON observations through a validated route
- `POST /api/board` as a programmatic surface
- Optional Gemini prose → watchlist config
- Invariant sweep across every as-of × every preset

**Out** (each belongs to a specific later day, listed under Scope boundaries):
live data sources, persistence, cron polling, CSV upload with header mapping,
generated prose of any kind, LLM classification of raw items, ICP fit scoring,
auth, E2E tests, CI.

## Stack (user-selected)

Next 16.3 (App Router) · React 19.2 · TypeScript strict + `noUncheckedIndexedAccess`
· Tailwind 4 · Zod 4.4 · Vitest 4.1 · `@google/genai` (optional path only) · npm
· Vercel.

`lib/signals/` imports nothing non-relative — not `next`, not `react`, not `zod`,
not `@/data`. Enforced by a test that scans the source for bare import specifiers.

## Data sources (user-selected)

**A committed synthetic timeline. No network, no keys, no live adapters.**

40 accounts, 8 observation dates over ~6 months, `.example` domains throughout,
labeled synthetic in the README. Signal *detection and prioritization* is the
skill on display; HTTP-fetching an RSS feed is not, and a portfolio demo whose
data source rots in three weeks is worse than no demo. Live single-source
monitoring is Day 061/062/063, which exist for exactly that.

**The dataset contains no event labels.** No `"type": "funding_round"`, no
`"category": "layoff"`, not the word *signal* anywhere. It contains headcounts,
funding stages, tool lists, exec rosters, page hashes, taglines, job-post titles
and release titles, each stamped with a date. Every event on the board is derived
by comparing two observations. This is the project's central engineering claim and
the dataset is where it is either true or a lie.

## Architecture

```
                    ┌─ scrub / tune ─► lib/signals (imported directly, no network)
Browser ────────────┤
                    ├─ POST /api/board          → Zod → buildBoard        → BoardRow[]
                    └─ POST /api/parse-watchlist → key check → rate limit
                                                → Gemini → Zod → config panel
                                                  (user reviews, then recomputes)
```

```
lib/signals/               ← pure. no non-relative imports, at all.
  types.ts                 Observation, Signal, Family, Evidence, BoardRow
  functions.ts             job title → function (keyword table; full normalization is Day 011)
  detect/state.ts          adjacent-snapshot scalar deltas  → Signal[]
  detect/arrivals.ts       dated items in window            → Signal[]
  detect/identity.ts       signal keys, refractory folding, escalation re-fire
  decay.ts                 anchor selection, half-life math, horizon
  score.ts                 diminishing returns, family caps, floor
  rank.ts                  ordering, lifecycle states, trend, sparkline
  index.ts                 buildBoard({ observations, watchlist, asOf })
lib/watchlist/             Zod schemas, Gemini parse, in-memory rate limiter
data/                      accounts.json, observations.json, presets.ts
app/api/board, app/api/parse-watchlist, app/components/
```

**`buildBoard` is the single exported function.** Day 007 (`why-now`) imports that
one call and nothing else. Keep the surface at one function; do not let route
handlers or components reach into `detect/` or `score.ts` directly.

**The engine runs in both places, deliberately.** It is pure TypeScript with zero
dependencies, so the client imports it directly and recomputes on every scrub
frame with no round-trip. `POST /api/board` exists as the validated programmatic
surface for paste-JSON and for anyone treating this as an API. This is a conscious
deviation from Days 001–004, which posted to a route on every edit; a date
scrubber makes that wrong, because a request per frame is a stutter per frame. It
is affordable *only* because of the purity rule — Zod and Gemini stay server-side,
and `<datalist>` vocabulary is derived from the raw JSON rather than the
Zod-parsed module so the schema never reaches the client bundle.

`app/page.tsx` is a server component that builds the board for the bundled
dataset at the default as-of date and hands it to the client as `initialBoard`.
First paint is a ranked board with no request. Do not replace it with a fetch on mount.

## Data model

```ts
type Iso = string;                    // "2026-03-14", date-only, no times anywhere

interface Account {
  id: string;                         // "a001"
  name: string;
  domain: string;                     // always *.example
  industry: string;
  fit: { score: number; band: "strong" | "moderate" | "weak" };  // arrives as data — see D9
}

interface Observation {
  account_id: string;
  observed_at: Iso;
  state: ObservedState;
  items: ObservedItem[];              // seen since the previous observation of this account
}

interface ObservedState {
  headcount: number | null;
  funding_stage: FundingStage | null; // "pre_seed" | "seed" | "series_a" | ... | "public"
  funding_total_usd: number | null;
  stack: string[];                    // tool names as strings, no classification
  execs: { fn: Fn; title: string }[]; // roster seats
  tagline: string | null;
  homepage_hash: string | null;
  pricing_page_hash: string | null;
}

type ObservedItem =
  | { kind: "job_post"; observed_at: Iso; title: string; department: string | null; location: string | null }
  | { kind: "release";  observed_at: Iso; title: string };

interface Evidence { observed_at: Iso; note: string }

interface Signal {
  key: string;              // `${account_id}:${type}:${subject}` (+ `#n` per occurrence)
  account_id: string;
  type: SignalType;         // the 10 below
  family: Family;           // "money" | "people" | "growth" | "technology" | "market"
  subject: string;          // tool name, function, stage, "headcount", "homepage"
  direction: "positive" | "negative";
  raw: number;              // from the watchlist, pre-decay
  anchor: "changed_at" | "last_evidence_at";
  anchor_at: Iso;
  known_within_days: number;  // 0 when snapshots are adjacent; the gap length otherwise
  magnitude: number | null;   // post count, % change, USD delta
  evidence: Evidence[];
  detail: string;             // the concrete comparison, populated always, never empty
}

interface DecayedSignal extends Signal {
  age_days: number; half_life_days: number; decayed: number; multiplier: number;
}

interface BoardRow {
  account: Account;
  total: number;              // integer, [-25, denominator]
  denominator: number;        // Σ family caps — displayed, never divided by
  families: { family: Family; points: number; cap: number; clipped: number }[];
  signals: DecayedSignal[];   // live, contributing
  dropped: { signal: Signal; reason: string }[];   // past horizon, or clipped by a cap
  state: "contracting" | "quiet" | "stale" | "rising" | "cooling" | "steady";
  trend: number;              // total − total(asOf − trendWindowDays)
  sparkline: { at: Iso; total: number }[];         // weekly across the range
}
```

### The 10 detectors

| # | `type` | Family | Shape | Raw | Fires on |
|---|---|---|---|---|---|
| 1 | `funding_round` | Money | state Δ | 25 | `funding_stage` advances or `funding_total_usd` increases |
| 2 | `exec_change` | People | state Δ | 22 gain / 14 loss | roster seat gained or lost in a `relevantFunctions` function |
| 3 | `key_role_opened` | Growth | arrival | 16 | job post whose derived function ∈ `relevantFunctions` |
| 4 | `hiring_surge` | Growth | arrival | 12 | ≥ `surgeMinPosts` posts within `surgeWindowDays` |
| 5 | `headcount_growth` | Growth | state Δ | 10 | headcount up ≥ `growthMinPct` |
| 6 | `headcount_contraction` | Growth | state Δ | **−18** | headcount down ≥ `contractionMinPct` |
| 7 | `stack_dropped` | Technology | state Δ | 20 | a `competitorTools` entry leaves `stack` |
| 8 | `stack_added` | Technology | state Δ | +10 / **−16** | complement enters (+) or competitor enters (−) |
| 9 | `positioning_change` | Market | state Δ | 7 | `tagline`, `homepage_hash` or `pricing_page_hash` changes |
| 10 | `product_launch` | Market | arrival | 8 | `release` item appears |

Two of the ten are negative on purpose. A signal engine that only knows good news
is a hype meter: an account shedding 30% of headcount must rank *below* an account
with no news at all, and a scale that stops at zero cannot say that.

`stack_dropped` firing on a *complement* is not a signal — the detector records it
in `dropped` with the reason rather than scoring it, so the board can show that the
comparison happened and was judged irrelevant.

### Decay

Half-life per **family**, not per signal — five numbers a reviewer can hold in
their head, all editable:

| Family | Cap | Half-life | Why |
|---|---|---|---|
| Money | 25 | 60d | Budget lands, then spends over two quarters |
| People | 25 | 45d | A new exec rebuilds their stack in their first 90 days |
| Growth | 20 | 30d | Hiring intent goes cold fast |
| Technology | 20 | 30d | A displacement window closes when they pick the replacement |
| Market | 10 | 21d | A launch is news for three weeks |

`decayed = raw × 0.5 ^ (age_days / half_life_days)`, rounded to integer points at
the end, never mid-chain. Past **4 half-lives** (under 7% of raw) a signal is
dropped with a reason rather than rendered as a 1-point ghost. Exponential rather
than step buckets because bucket edges create cliffs where one day of scrub
reorders the board — and a reviewer dragging the slider *will* land on one.

**The anchor is asymmetric, and this is the sharpest idea in the engine:**

- **State deltas decay from `changed_at`.** A round closed once. It is 40 days old
  and getting older.
- **Arrival signals decay from `last_evidence_at`.** A hiring surge that is still
  posting is still hot. The freshness of an ongoing pattern is its most recent
  evidence, not its first.

Two lines of code; the difference between a decay model someone believes and one
they don't. `detail` names which anchor was used.

### Identity and re-detection

Every detector re-runs at every snapshot, so identity is what stops the board
becoming a duplicate farm.

- Key is `account_id : type : subject`. Subject is the thing the signal is *about*
  — the tool name, the exec function, the role family, the funding stage.
- Re-detection inside the refractory window (`refractoryDays`, default 45) **folds
  into the existing signal** as another `evidence[]` entry. For arrival signals
  that also advances `last_evidence_at`, which is the mechanism keeping an ongoing
  surge hot. For state deltas it does not move `changed_at`.
- Re-detection with **material escalation** — magnitude grows by ≥ `escalationFactor`
  (default 2×) — re-fires as a new occurrence, `key#2`, with a fresh anchor.

### Scoring

Per family: sort positive contributions descending, apply `1.0, 0.5, 0.25, 0.125…`,
sum. Negatives sum at **full weight, no diminishing** — a second piece of bad news
is not less bad. Clamp the family to `[-cap, +cap]`; record whatever was clipped so
the UI can show it.

`total = clamp(Σ families, -25, Σ caps)`.

Caps sum to exactly 100 by construction, so **the total is natively 0–100 with no
normalization step and no division anywhere in the scoring path** — which removes
the entire `NaN` / divide-by-zero class rather than guarding against it. If a user
edits caps to sum to 140, the board honestly reads `72 / 140`; it does not
renormalize, because renormalizing would put the division back.

### Cold start and gaps

- **The first observation of an account establishes a baseline and emits nothing.**
  Diffing snapshot 1 against nothing reads every field as changed and lights up the
  whole board on day one. This is the single most likely bug in the build and gets
  its own test.
- **A gap is attributed to the later snapshot but decays from the earliest date the
  change could have occurred.** `known_within_days` carries the gap length and the
  UI says `detected within a 90-day window` rather than inventing a date. The one
  direction a timing tool is not allowed to err is claiming something is fresher
  than it is — so the conservative bound is the load-bearing one.

### Lifecycle states

Derived from the score trajectory, no persistence, no stored machine. First match wins:

| State | Rule |
|---|---|
| `contracting` | `total < 0` |
| `quiet` | no signal has ever fired at or before `asOf` |
| `stale` | signals exist but all are past the horizon → `total === 0` |
| `rising` | `trend > 0` |
| `cooling` | `trend < 0` |
| `steady` | otherwise |

`trend` compares against `asOf − trendWindowDays` (default 14). **Distinguishing
`stale` from `quiet` matters more than it looks** — "we watched and nothing ever
happened" and "this went cold four months ago" are opposite sales situations, and
every tool I have seen renders both as an empty row.

Ranking: `total` descending, ties by `fit.score` descending, then account name.
Deterministic and stable.

### Watchlist

```ts
interface Watchlist {
  name: string;
  families: Record<Family, { cap: number; halfLifeDays: number }>;
  weights: Record<SignalType, number>;
  thresholds: {
    surgeMinPosts: number; surgeWindowDays: number;
    growthMinPct: number; contractionMinPct: number;
    refractoryDays: number; escalationFactor: number;
    horizonHalfLives: number; trendWindowDays: number;
  };
  relevantFunctions: Fn[];
  competitorTools: string[];
  complementTools: string[];
  actNowAt: number;          // the line drawn across the board
}
```

Three presets, which between them fire all 10 detectors — displacement motion
(Technology-weighted), growth motion (Growth + People), budget motion (Money). If
a detector is in no preset, nobody ever sees it work.

## Dataset design

**40 accounts × 8 observation dates over ~6 months**, distribution designed rather
than sampled. Ten deliberate rows, each earning its place in the demo:

| Row | What it is | What it proves |
|---|---|---|
| `a001` | Hype account — repeated launches + positioning churn | Market cap 10 clips raws summing to 15+; noise saturates |
| `a002` | Exec hire + hiring surge in the same function | Legitimate compounding tops the board |
| `a003` | Fit 95, zero signals ever | `quiet` ≠ worthless; belongs in Nurture |
| `a004` | Fit 91, headcount −30% | Renders **below** `a003`. The negative floor earns its place |
| `a005` | 90-day hole in the timeline | `known_within_days: 90`, decays from the early bound |
| `a006` | First observed at snapshot 5 | Emits nothing that date. Cold-start regression guard |
| `a007` | Hiring surge 4 posts → 14 posts | Escalation re-fire, `key#2` |
| `a008` | Funding round ~100 days before default as-of | 25 raw → ~8 decayed. The row you point at to explain decay |
| `a009` | Signals only outside the horizon | `stale`, distinct from `a003`'s `quiet` |
| `a010` | Displacement pair with `a011` — drops a competitor | Same delta, opposite sign as `a011` which adds one |

The remaining 29 are a plausible middle. `data/dataset.ts` parses the JSON through
Zod at import time, so a bad hand-edit fails the build rather than a request. The
distribution is pinned by hand-rolled assertions in a test, so flattening it fails
CI instead of quietly making the demo boring.

## Validation / test plan

Vitest over `lib/**` only (`vitest.config.mts`, `.mts` deliberately). Unit tests per
detector, per decay path, per scoring rule, plus:

- **`purity.test.ts`** — scans `lib/signals/**` for any bare import specifier.
  No allowlist. If the engine needs a package, the code belongs elsewhere.
- **`dataset.test.ts`** — pins the ten engineered rows.
- **`scripts/sweep.ts`** (`npm run sweep`) — runs every as-of date across the full
  range × all 3 presets and asserts invariants:
  - no `NaN`, `Infinity` or `undefined` reaches any score
  - `total ∈ [-25, denominator]`; every family within `[-cap, cap]`
  - **with no new evidence, `total` is monotonically non-increasing as `asOf`
    advances** — the single property that catches most decay bugs
  - the first observation of any account emits zero signals
  - no duplicate signal keys within an account
  - ranking is deterministic across runs and stable under equal totals
  - every `detail` string is non-empty

Day 004's sweep found three real bugs. The monotonicity property is the one I
expect to fail first here, and the one that would otherwise ship broken and unnoticed.

Manual verification: the main journey (land → read → expand → scrub → tune →
preset → quadrant → export) plus failure states (no Gemini key, rate-limited,
malformed paste, empty observations, single-observation account, all-negative board).

## Implementation task order

Nine commits, each independently sound:

1. **scaffold** — Next 16 app, `tsconfig` strict + `noUncheckedIndexedAccess`,
   Vitest, the type contract in `lib/signals/types.ts`, the purity test failing
   loudly on the empty engine.
2. **dataset** — Zod schemas, `accounts.json`, `observations.json` with all ten
   traps, `presets.ts`, `dataset.test.ts`.
3. **detectors** — `detect/state.ts`, `detect/arrivals.ts`, `functions.ts`,
   `detect/identity.ts` with refractory + escalation. Tests per detector.
4. **decay + score + rank** — anchors, half-lives, horizon, diminishing returns,
   caps, floor, lifecycle states, sparkline. `buildBoard` complete.
5. **sweep** — `scripts/sweep.ts` and every invariant above. Fix what it finds.
6. **routes** — `POST /api/board`, `POST /api/parse-watchlist`, rate limiter,
   schemas, body/size caps.
7. **board UI** — server-component first paint, as-of scrubber, ranked rows,
   evidence expansion with full arithmetic, dropped panel, watchlist editor,
   sparklines.
8. **quadrant + exports** — fit×signal tab, `board.json`, `signals.csv`,
   paste-JSON panel.
9. **docs** — README, `docs/plain-english-guide.md`, screenshots, the scrub GIF.

## Deployment plan

Vercel, `main` auto-deploy. `GEMINI_API_KEY` set in project env; `.env.local`
gitignored, `.env.example` committed with the name and no value. The app must work
fully with the key unset — only the prose-to-watchlist convenience degrades, to a
message pointing at the editor. Live URL replaces the README's `[Live Demo](#)`.

## README plan

Master template from the backlog. Notes that must appear: synthetic data stated
plainly; the derived-not-supplied claim; the anchor asymmetry; why fit and signal
are two axes; Limitations naming no live sources, no persistence, per-instance
in-memory rate limiting on Vercel, and the LLM's config-only role.

## Definition of done

Live Vercel URL renders a ranked board over the bundled dataset with zero
configuration · scrubbing the date reorders the board with no network requests ·
every number on an expanded row reproducible with a calculator · `npm test`,
`npm run sweep`, `npm run build`, `npm run typecheck`, `npm run lint` all clean ·
app works with `GEMINI_API_KEY` unset · README follows the master template with the
synthetic-data note and explicit limitations · screenshots and the scrub GIF committed.

The Day 005 checkbox in the master backlog is ticked only on the user's explicit
confirmation that it shipped.

## Scope boundaries

Out of scope for this repo, and belonging to specific later days:

| Feature | Belongs to |
|---|---|
| ICP fit scoring | Day 001 `icp-score` (fit arrives here as data) |
| Any data enrichment | Day 002 `enrichment-waterfall` |
| CSV upload, header mapping, coercion | Day 003 `lead-cleaner` |
| Persona / buying committee logic | Day 004 `persona-mapper` |
| Narrative "why now" for one account | Day 007 `why-now` (imports `buildBoard`) |
| Job-title normalization beyond a keyword table | Day 011 `title-normalizer` |
| Live competitor / jobs / website monitoring | Days 061, 062, 063, 065 |
| CRM object change feeds | Day 039 `pipeline-change-feed` |
| Evals for LLM classification of raw items | Day 042 `research-agent-eval` |

Also out: persistence, auth, cron polling, multi-tenant watchlists, E2E tests, CI.

**Hard rule: no generated sentences anywhere in the output path.** Every reason
string is a template filled by the engine.

## Post-MVP ideas (not part of this build)

- LLM classification of raw items inside detection, gated by an eval suite
- Live adapters behind the same `Observation` interface
- Persisted observation history with real cron polling
- Webhook / digest delivery on threshold crossing
- Signal correlation across accounts (a competitor losing three customers at once)

---

## Settled decisions

Recorded so they are not relitigated mid-build.

1. **Claim is diff-then-decay.** Change detection produces the events; the engine
   scores, decays and ranks them. Monitoring without a diff is a scored list, and
   Day 001 already shipped one of those.
2. **Synthetic committed timeline, no network.** Works with no key. Live sourcing
   belongs to Days 061–065.
3. **Simulated clock, not persistence.** Engine is a pure function of
   `(observations, watchlist, asOf)`. The scrub is the demo and there is no clock to mock.
4. **Ranked unit is the account,** carrying its signal stack. A feed is a secondary
   view at best; "who do I touch today" is the question.
5. **No prose in the output path.** Reasons are engine templates. Narrative is Day 007.
6. **Stack and discipline carry over from Days 001–004,** including the purity test.
   `lib/signals/` gets real internal structure rather than one `engine.ts`.
7. **Observation = scalar state + append-only dated items.** Two detector shapes,
   one signal type. Dataset carries no event labels of any kind.
8. **10 detectors in 5 families; two are negative.** Families exist because
   saturation needs them and because five numbers are readable where ten are not.
9. **Fit arrives as data and is never blended.** Timing and fit are different
   questions; multiplying them destroys both. Two axes, one quadrant view.
10. **Gemini tunes the ruler, never reads the measurement.** Prose → watchlist
    config, into an editor, before anything scores. Item classification is
    deliberately deferred with its eval named.
11. **Stable identity + refractory folding + escalation re-fire.** And the anchor
    asymmetry: state deltas decay from `changed_at`, arrivals from `last_evidence_at`.
12. **Exponential half-life per family, horizon at 4 half-lives.** Buckets create
    cliffs the scrubber lands on.
13. **Family caps summing to 100, in-family diminishing returns on positives only,
    total floored at −25.** No normalization, no division, therefore no `NaN` class.
14. **First observation emits nothing; gaps decay from the earliest possible date.**
    Never claim something is fresher than it is; never invent a timestamp.
15. **Six derived lifecycle states,** including `stale` distinct from `quiet`.
16. **As-of scrubber is the hero control;** sparkline per row; quadrant as tab two.
17. **40 accounts × 8 dates, ten engineered traps, distribution pinned by test.**
18. **Bundled dataset + paste-JSON only. No CSV upload** — that is Day 003.
    Exports are `board.json` and `signals.csv`; a third export nobody opens.
19. **Invariant sweep across every as-of × every preset,** monotonicity included.
20. **Caps are editable and the engine does not renormalize** — the denominator is
    displayed instead. Three presets covering all 10 detectors.
21. **`buildBoard` is the only exported engine function.** Day 007 imports that.
22. **Engine runs client-side for scrubs and server-side behind `/api/board`.**
    Deliberate deviation from Days 001–004, affordable only because of purity.
23. **Full docs set** — README, plain-English guide, screenshots, and a GIF of the
    scrub. Consistency across five repos is itself part of the portfolio.
24. **`akshatiwarix/signal-scout`, MIT, Vercel, nine pushed commits.**
