# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project state

**Plan signed off; implementation not started.** The repo currently holds `PLAN.md`,
`LICENSE` and this file. Next task is commit 1 of 9: scaffold Next 16, the type
contract in `lib/signals/types.ts`, and the purity test.

`PLAN.md` is the source of truth for scope, data model, detector table, decay math,
task order and definition of done. **Read it before writing code.** It records 24
settled decisions from a five-round design interview — treat them as decided, not
as open questions to relitigate.

This is Day 005 of a 100-day build challenge. Each day is its own standalone repo.
The master backlog lives outside this repo (on the user's Desktop) and must never
be committed here.

## Commands

Land these in `package.json` at scaffold time; they mirror Days 001–004 so a
reviewer types the same thing in every repo.

```bash
npm run dev                      # dev server
npm run build                    # production build — run before claiming done
npm test                         # vitest run (globs lib/**/*.test.ts only)
npm run test:watch               # watch mode
npm run sweep                    # invariant sweep across every as-of × every preset
npm run typecheck                # next typegen && tsc --noEmit
npm run lint                     # eslint
npx vitest run lib/signals/decay.test.ts          # single file
npx vitest run -t "first observation emits nothing"  # single test by name
```

`npm` is the committed package manager — README and lockfile stay npm even if bun
is used locally, because `npm install && npm run dev` is what a reviewer types
without reading.

Two setup facts inherited from earlier days: Vitest config belongs in
`vitest.config.mts` (`.mts`, not `.ts` — the extension is what stops Vite's config
loader warning about ESM-in-CJS), and `tsc` alone fails on a clean checkout because
`LayoutProps` and friends are generated into `.next/types`, so `typecheck` must run
`next typegen` first. Never "fix" that error by editing `app/layout.tsx`.

`tsconfig.json` sets `noUncheckedIndexedAccess` on top of `strict` — array and
record access yields `T | undefined`. Handle it; do not reach for `!`.

## Architecture

```
                    ┌─ scrub / tune ─► lib/signals (imported directly, no network)
Browser ────────────┤
                    ├─ POST /api/board          → Zod → buildBoard → BoardRow[]
                    └─ POST /api/parse-watchlist → key check → rate limit
                                                → Gemini → Zod → config panel
```

`lib/signals/` is the engine: `types.ts`, `detect/{state,arrivals,identity}.ts`,
`functions.ts`, `decay.ts`, `score.ts`, `rank.ts`, `index.ts`. Around it sit
`lib/watchlist/` (Zod schemas, Gemini parse, rate limiter), `data/`, `app/api/`,
`app/components/`.

**`lib/signals/` imports nothing non-relative** — not `next`, not `react`, not
`zod`, not `@/data`. `purity.test.ts` enforces it by scanning for bare import
specifiers, with no allowlist. If a change to the engine needs a package, move the
code to `lib/watchlist/` or the route handler instead of widening the rule. This
constraint buys three things: the engine is unit-testable with no harness, Day 007
`why-now` imports it unchanged, and it is what makes shipping the engine to the
browser affordable.

**`buildBoard({ observations, watchlist, asOf })` is the only exported engine
function.** Route handlers and components must not reach into `detect/` or
`score.ts` directly.

**The engine runs on both sides on purpose.** The client imports it and recomputes
locally on every scrub frame — a request per frame is a stutter per frame. `POST
/api/board` remains the validated programmatic surface for paste-JSON and API use.
This is a deliberate deviation from Days 001–004; keep Zod and Gemini server-side
so the deviation stays cheap, and derive `<datalist>` vocabulary from the raw JSON
rather than the Zod-parsed module.

`app/page.tsx` is a server component that builds the board for the bundled dataset
at the default as-of date. First paint is a ranked board with no request and no
empty state — do not replace it with a fetch on mount.

Route handlers use Web `Request`/`Response` (`Response.json(...)`, no
`NextResponse`). `data/dataset.ts` parses the JSON through Zod at import time so a
bad hand-edit fails the build rather than a request.

## Non-negotiable invariants

**Every event on the board is derived, never supplied.** The dataset contains no
event labels — no `"type": "funding_round"`, no `"category": "layoff"`, not the
word *signal* anywhere. It contains headcounts, funding stages, tool lists, exec
rosters, page hashes, taglines and dated job-post/release titles. Adding a labelled
field to the dataset destroys the entire engineering claim.

**The LLM tunes the ruler and never reads the measurement.** Gemini's only job is
prose → watchlist config, once, up front, into an editor the user reviews before
anything scores. No generated sentences anywhere in the output path; every reason
string is an engine template. Classifying raw items with a model is explicitly
deferred to a post-MVP step with its eval named.

**The app works fully with `GEMINI_API_KEY` unset.** Only the prose convenience
degrades, to a message pointing at the watchlist editor.

**Fit is data, not a computed value, and is never blended into the signal score.**
Accounts carry a `fit` band as if it came from Day 001's `/api/score`. Timing and
fit are different questions; multiplying them produces a number that cannot
distinguish "perfect customer, dead quiet" from "on fire, wrong company". Two axes,
plus a quadrant view.

**No division in the scoring path.** Family caps sum to 100 by construction, so the
total is natively 0–100 with no normalization — that is what removes the
`NaN`/divide-by-zero class rather than guarding against it. If a user edits caps to
sum to 140, display `72 / 140`; do not renormalize.

**The first observation of an account emits zero signals.** Diffing snapshot 1
against nothing marks every field as changed and lights up the whole board. This is
the most likely bug in the build and has its own test.

**Never claim a signal is fresher than it is.** A gap in the timeline attributes the
change to the later snapshot but decays it from the *earliest* date it could have
occurred, and carries `known_within_days` so the UI can say `detected within a
90-day window`. Interpolating a timestamp fabricates the exact quantity the product
sells.

## Engine rules worth not rediscovering

- **The decay anchor is asymmetric.** State deltas decay from `changed_at` (a round
  closed once); arrival signals decay from `last_evidence_at` (a surge that is still
  posting is still hot). Two lines of code, and the difference between a decay model
  someone believes and one they don't. `detail` must name which anchor was used.
- **Identity is `account_id : type : subject`.** Re-detection inside
  `refractoryDays` folds in as another `evidence[]` entry rather than creating a
  second signal; escalation of ≥ `escalationFactor` re-fires as `key#2` with a fresh
  anchor. Without this, every detector re-firing at every snapshot makes the board a
  duplicate farm.
- **Diminishing returns apply to positives only.** Within a family, sort descending
  and apply `1.0, 0.5, 0.25, …`; negatives sum at full weight, because a second
  piece of bad news is not less bad. Family clamps to `[-cap, +cap]`, total to
  `[-25, Σcaps]`.
- **Two of the ten detectors are negative.** An engine that only knows good news is
  a hype meter. `headcount_contraction` must be able to rank an account *below* one
  with no signals at all.
- **A detector that considered something and rejected it says so.** `stack_dropped`
  on a complement, a signal past the horizon, a contribution clipped by a cap — all
  land in `dropped` with a reason. The excluded panel is informative, not a dead end.
- **Every `Signal.detail` carries the concrete arithmetic** — `funding_round: 25 raw
  × 0.5^(72/60) = 10 pts (72d since changed_at)`. This is what makes the board
  explainable; populate it, never leave it empty.
- **`stale` and `quiet` are different states.** "This went cold four months ago" and
  "we watched and nothing ever happened" are opposite sales situations.
- Format numbers in `detail` with a pinned `Intl.NumberFormat("en-US")` so strings
  are byte-identical across machines.

## Testing

`npm test` covers detectors, decay, scoring and ranking. Two tests carry more weight
than the rest: `purity.test.ts` (the import boundary) and `dataset.test.ts` (pins the
ten engineered trap rows, so flattening the distribution fails CI instead of quietly
making the demo boring).

`npm run sweep` runs every as-of date × all three presets and asserts the invariants
listed in `PLAN.md` — no `NaN`, bounds respected, first observation silent, no
duplicate keys, deterministic ranking, and **monotonic non-increase of `total` as
`asOf` advances with no new evidence**. Day 004's equivalent sweep found three real
bugs; the monotonicity property is the one expected to fail first here.

## Scope boundaries

Do not add these — each belongs to a specific later day: ICP fit scoring (Day 001),
enrichment (002), CSV upload and header mapping (003), persona logic (004),
narrative "why now" (007), real title normalization beyond a keyword table (011),
live monitoring adapters (061–065), CRM change feeds (039), LLM eval suites (042).

Also out: persistence, auth, cron polling, multi-tenant watchlists, E2E tests, CI.

Company input is the bundled dataset plus paste-JSON only. If a change starts
requiring encoding edge cases or header inference, it has crossed into Day 003.

## Commits

Nine commits, one per task in `PLAN.md`. Message voice matches Days 001–004:
lowercase conventional type, then prose that names the substance — e.g.
`feat: the whole engine — anchors, families, caps, the floor`. Push after each.
