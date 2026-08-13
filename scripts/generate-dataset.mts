/**
 * Writes `data/accounts.json` and `data/observations.json`.
 *
 * The output is committed; this script exists so the distribution is auditable and
 * regenerable rather than a wall of hand-typed JSON nobody can safely edit. Run it
 * with `npm run generate:dataset`.
 *
 * Two rules it must never break:
 *
 * 1. **No event labels.** Nothing here writes a signal name, a category, or a
 *    "this is a funding round" flag into the output. It writes headcounts, stages,
 *    tool lists, rosters, page hashes and dated titles. Every event on the board is
 *    derived by the engine comparing two of these.
 * 2. **No `Math.random`.** A seeded generator keeps the dataset byte-identical
 *    across machines, which is what lets the sweep assert determinism.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  Account,
  ExecSeat,
  Fn,
  FundingStage,
  Observation,
  ObservedItem,
  ObservedState,
} from "../lib/signals/types.ts";

/**
 * Twelve crawl dates over roughly six months: fortnightly, tightening to weekly at the
 * end, with one deliberate month-long stretch in the middle.
 *
 * The cadence is load-bearing, not decoration. Because a state change is anchored at the
 * *previous* crawl (the earliest moment it could have happened), the crawl interval is a
 * floor on how old any change can appear: crawl monthly and nothing is ever less than
 * ~30 days old, which against a 30-day half-life means no signal can ever show more than
 * half its weight. That is a true statement about monthly crawling, and it would make the
 * whole board read as if the scale were broken. Fortnightly crawling is just as plausible
 * and lets a fresh change look fresh.
 */
const DATES = [
  "2026-02-20",
  "2026-03-06",
  "2026-03-20",
  "2026-04-03",
  "2026-04-17",
  "2026-05-01",
  "2026-05-15",
  "2026-06-12",
  "2026-07-10",
  "2026-07-24",
  "2026-08-05",
  "2026-08-12",
] as const;

const COMPETITORS = ["Rivalytics", "Sentrylight", "Datastream Pro"];
const COMPLEMENTS = ["Warehowse", "Modelform", "Terraflow", "Podship", "Pagelight"];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
}

function isoFromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Evenly spaced dates strictly inside `(from, to]`, so items sit in the crawl window. */
function spread(from: string, to: string, count: number): string[] {
  const start = dayNumber(from);
  const end = dayNumber(to);
  const span = Math.max(1, end - start);
  return Array.from({ length: count }, (_, i) =>
    isoFromDay(start + Math.max(1, Math.round(((i + 1) * span) / (count + 1)))),
  );
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260813);

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error("pick from empty list");
  return item;
}

function seat(fn: Fn, title: string): ExecSeat {
  return { fn, title };
}

const TITLES: Record<Fn, string[]> = {
  engineering: ["Senior Backend Engineer", "Staff Platform Engineer", "Engineering Manager"],
  data: ["Analytics Engineer", "Staff Data Engineer", "Data Platform Lead"],
  security: ["Security Engineer", "Application Security Lead"],
  it: ["IT Operations Engineer", "Systems Administrator"],
  product: ["Senior Product Manager", "Group Product Manager"],
  design: ["Product Designer", "Design Lead"],
  marketing: ["Demand Generation Manager", "Product Marketing Manager"],
  sales: ["Enterprise Account Executive", "Sales Development Representative"],
  revops: ["Revenue Operations Manager", "Sales Systems Analyst"],
  customer_success: ["Customer Success Manager", "Technical Account Manager"],
  finance: ["Financial Analyst", "Revenue Accountant"],
  people: ["Technical Recruiter", "People Operations Partner"],
  operations: ["Business Operations Manager", "Supply Operations Analyst"],
  legal: ["Commercial Counsel"],
};

const DEPARTMENTS: Record<Fn, string> = {
  engineering: "Engineering",
  data: "Data",
  security: "Security",
  it: "IT",
  product: "Product",
  design: "Design",
  marketing: "Marketing",
  sales: "Sales",
  revops: "Revenue Operations",
  customer_success: "Customer Success",
  finance: "Finance",
  people: "People",
  operations: "Operations",
  legal: "Legal",
};

const LOCATIONS = ["Remote — US", "Austin, TX", "Berlin, DE", "Toronto, ON", "London, UK"];

function jobPosts(from: string, to: string, fn: Fn, count: number): ObservedItem[] {
  return spread(from, to, count).map((observed_at, i) => ({
    kind: "job_post" as const,
    observed_at,
    title: TITLES[fn][i % TITLES[fn].length] ?? "Engineer",
    // A real board reports a department most of the time and nothing the rest.
    department: rand() > 0.25 ? DEPARTMENTS[fn] : null,
    location: pick(LOCATIONS),
  }));
}

function releases(from: string, to: string, titles: string[]): ObservedItem[] {
  const dates = spread(from, to, titles.length);
  return titles.map((title, i) => ({
    kind: "release" as const,
    observed_at: dates[i] ?? to,
    title,
  }));
}

/**
 * A recipe is the whole life of an account: a starting state, cumulative mutations
 * at chosen crawl indices, dated items per crawl, and which crawls saw it at all.
 */
interface Recipe {
  account: Account;
  base: ObservedState;
  /** Crawl indices where this account was not observed. Produces gaps and late starts. */
  absent?: number[];
  mutate?: Partial<Record<number, Partial<ObservedState>>>;
  items?: Partial<Record<number, ObservedItem[]>>;
}

function account(
  id: string,
  name: string,
  industry: string,
  fitScore: number,
): Account {
  const band = fitScore >= 80 ? "strong" : fitScore >= 60 ? "moderate" : "weak";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id,
    name,
    domain: `${slug}.example`,
    industry,
    fit: { score: fitScore, band },
  };
}

function state(overrides: Partial<ObservedState>): ObservedState {
  return {
    headcount: 120,
    funding_stage: "series_a",
    funding_total_usd: 18_000_000,
    stack: [],
    execs: [],
    tagline: "Software for teams",
    homepage_hash: "home-1",
    pricing_page_hash: "price-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The ten engineered rows. Each one exists to make a specific rule visible.
// ---------------------------------------------------------------------------

const ENGINEERED: Recipe[] = [
  // a001 — hype. Six market events; the Market cap clips them to 10 points.
  {
    account: account("a001", "Loudwave Labs", "Marketing Software", 62),
    base: state({
      headcount: 140,
      stack: ["Warehowse", "Podship"],
      execs: [seat("engineering", "VP Engineering"), seat("marketing", "CMO")],
      tagline: "Ship faster",
    }),
    mutate: {
      8: { tagline: "Ship faster, together", homepage_hash: "home-2" },
      9: { homepage_hash: "home-3" },
      10: { tagline: "The platform for shipping", homepage_hash: "home-4", pricing_page_hash: "price-2" },
      11: { homepage_hash: "home-5" },
    },
    // Clustered into the last six weeks on purpose. Spread thinly across six months,
    // decay alone would flatten them and the family cap would never have to do anything —
    // and the cap is the rule this row exists to demonstrate.
    items: {
      9: releases(DATES[8], DATES[9], ["Loudwave 3.0"]),
      10: releases(DATES[9], DATES[10], ["Inline previews", "Workspace themes"]),
      11: releases(DATES[10], DATES[11], ["Loudwave AI beta", "Mobile app"]),
    },
  },

  // a002 — legitimate compounding: an engineering leader arrives and hiring follows.
  {
    account: account("a002", "Northbeam Systems", "Industrial Software", 88),
    base: state({
      headcount: 210,
      funding_stage: "series_b",
      funding_total_usd: 52_000_000,
      stack: ["Warehowse", "Terraflow"],
      execs: [seat("product", "VP Product"), seat("sales", "CRO")],
      tagline: "Operations software for plants",
    }),
    mutate: {
      9: {
        headcount: 262,
        execs: [seat("product", "VP Product"), seat("sales", "CRO"), seat("engineering", "VP Engineering")],
      },
      11: { headcount: 288 },
    },
    items: {
      9: jobPosts(DATES[8], DATES[9], "engineering", 5),
      10: jobPosts(DATES[9], DATES[10], "engineering", 3),
      11: jobPosts(DATES[10], DATES[11], "data", 2),
    },
  },

  // a003 — quiet. Best fit on the board and nothing has ever happened to it.
  {
    account: account("a003", "Steadymark Health", "Healthcare IT", 95),
    base: state({
      headcount: 320,
      funding_stage: "series_c",
      funding_total_usd: 140_000_000,
      stack: ["Warehowse", "Modelform", "Terraflow"],
      execs: [seat("engineering", "CTO"), seat("data", "VP Data"), seat("security", "CISO")],
      tagline: "Clinical data infrastructure",
    }),
  },

  // a004 — contracting, and a strong fit. Must rank below a003's silence.
  {
    account: account("a004", "Harborline Retail", "Retail Technology", 91),
    base: state({
      headcount: 260,
      funding_stage: "series_b",
      funding_total_usd: 64_000_000,
      stack: ["Warehowse", "Pagelight"],
      execs: [seat("engineering", "VP Engineering"), seat("operations", "COO")],
      tagline: "Retail operations, simplified",
    }),
    mutate: { 10: { headcount: 182 }, 11: { headcount: 176 } },
  },

  // a005 — an 89-day hole. The round is real; the date it landed is not knowable.
  {
    account: account("a005", "Fernbrook Data", "Data Infrastructure", 84),
    base: state({
      headcount: 96,
      funding_stage: "series_a",
      funding_total_usd: 14_000_000,
      stack: ["Warehowse", "Rivalytics"],
      execs: [seat("engineering", "VP Engineering")],
      tagline: "Pipelines without the plumbing",
    }),
    absent: [7, 8, 9, 10],
    mutate: { 11: { funding_stage: "series_b", funding_total_usd: 48_000_000, headcount: 138 } },
  },

  // a006 — first seen at crawl 5. Must emit nothing that day, however different it
  // looks from every other account. This is the cold-start regression guard.
  {
    account: account("a006", "Quietstart Robotics", "Robotics", 76),
    base: state({
      headcount: 90,
      funding_stage: "series_a",
      funding_total_usd: 21_000_000,
      stack: ["Rivalytics", "Terraflow"],
      execs: [seat("engineering", "VP Engineering"), seat("data", "Head of Data")],
      tagline: "Autonomy for warehouses",
    }),
    absent: [0, 1, 2, 3, 4, 5, 6],
    mutate: { 9: { stack: ["Terraflow", "Warehowse"] } },
  },

  // a007 — escalation. Four posts, then fourteen: the same subject, materially bigger.
  {
    account: account("a007", "Tallgrass Logistics", "Logistics", 79),
    base: state({
      headcount: 180,
      funding_stage: "series_b",
      funding_total_usd: 40_000_000,
      stack: ["Warehowse"],
      execs: [seat("operations", "COO"), seat("engineering", "Director of Engineering")],
      tagline: "Freight, coordinated",
    }),
    items: {
      6: jobPosts(DATES[5], DATES[6], "engineering", 4),
      9: jobPosts(DATES[8], DATES[9], "engineering", 14),
      10: jobPosts(DATES[9], DATES[10], "engineering", 6),
    },
  },

  // a008 — the decay exhibit. Round landed at crawl 3, 89 days before the default
  // as-of date: 25 raw × 0.5^(89/60) ≈ 9 points by the time you look at it.
  {
    account: account("a008", "Cobalt Ledger", "Fintech", 86),
    base: state({
      headcount: 74,
      funding_stage: "seed",
      funding_total_usd: 4_500_000,
      stack: ["Warehowse", "Modelform"],
      execs: [seat("engineering", "CTO"), seat("finance", "VP Finance")],
      tagline: "Ledgers for embedded finance",
    }),
    mutate: { 7: { funding_stage: "series_a", funding_total_usd: 26_000_000, headcount: 88 } },
  },

  // a009 — stale, not quiet. Everything it ever did is past the Market horizon.
  {
    account: account("a009", "Mistveil Media", "Media", 72),
    base: state({
      headcount: 60,
      funding_stage: "seed",
      funding_total_usd: 3_000_000,
      stack: ["Pagelight"],
      execs: [seat("marketing", "CMO")],
      tagline: "Stories that travel",
    }),
    mutate: { 2: { tagline: "Stories, everywhere", homepage_hash: "home-2" } },
    items: { 2: releases(DATES[1], DATES[2], ["Mistveil Reader"]) },
  },

  // a010 / a011 — the displacement pair. Identical accounts, same crawl, one drops
  // a competitor and one adds it. Same delta, opposite sign.
  {
    account: account("a010", "Ridgeport Analytics", "Analytics", 83),
    base: state({
      headcount: 150,
      funding_stage: "series_b",
      funding_total_usd: 45_000_000,
      stack: ["Warehowse", "Rivalytics", "Terraflow"],
      execs: [seat("data", "VP Data"), seat("engineering", "VP Engineering")],
      tagline: "Analytics for operators",
    }),
    mutate: { 10: { stack: ["Warehowse", "Terraflow"] } },
  },
  {
    account: account("a011", "Kestrel Payments", "Payments", 83),
    base: state({
      headcount: 150,
      funding_stage: "series_b",
      funding_total_usd: 45_000_000,
      stack: ["Warehowse", "Terraflow"],
      execs: [seat("data", "VP Data"), seat("engineering", "VP Engineering")],
      tagline: "Payments for operators",
    }),
    mutate: { 10: { stack: ["Warehowse", "Terraflow", "Rivalytics"] } },
  },
];

// ---------------------------------------------------------------------------
// The plausible middle. Twenty-nine accounts assembled from a seeded recipe so the
// board has texture: some accounts do one thing, some do nothing, a few do several.
// ---------------------------------------------------------------------------

const MIDDLE_NAMES: [string, string][] = [
  ["Alderway Freight", "Logistics"],
  ["Bluecrest Legal", "Legal Technology"],
  ["Cindermill Foods", "Food & Beverage"],
  ["Drovers Insurance", "Insurance"],
  ["Eastgate Learning", "Education Technology"],
  ["Foxglove Biotech", "Biotech"],
  ["Glasshouse Travel", "Travel"],
  ["Halewood Energy", "Energy"],
  ["Ironvale Manufacturing", "Manufacturing"],
  ["Junegrove Fitness", "Consumer Fitness"],
  ["Kelpline Maritime", "Maritime"],
  ["Larkfield Property", "Real Estate"],
  ["Meridian Payroll", "HR Technology"],
  ["Nettlebed Gaming", "Gaming"],
  ["Orchard Row Grocery", "Grocery"],
  ["Pinehollow Security", "Cybersecurity"],
  ["Quarrybank Mining", "Mining"],
  ["Rushmere Telecom", "Telecom"],
  ["Saltmarsh Agriculture", "Agriculture"],
  ["Thornbury Pharma", "Pharma"],
  ["Underhill Publishing", "Publishing"],
  ["Vellamo Water", "Utilities"],
  ["Westcliff Banking", "Banking"],
  ["Yarrowfield Textiles", "Textiles"],
  ["Zephyr Freight Tech", "Logistics"],
  ["Ashcombe Robotics", "Robotics"],
  ["Brightwater Devices", "Medical Devices"],
  ["Coldharbour Cloud", "Cloud Infrastructure"],
  ["Dunmore Analytics", "Analytics"],
];

const STAGES: FundingStage[] = ["seed", "series_a", "series_b", "series_c"];
const RELEVANT: Fn[] = ["engineering", "data", "security", "it", "revops", "finance"];
const OTHER_FNS: Fn[] = ["marketing", "sales", "customer_success", "operations", "people"];

function middleRecipe(index: number): Recipe {
  const entry = MIDDLE_NAMES[index];
  if (!entry) throw new Error(`no middle account at ${index}`);
  const [name, industry] = entry;
  const id = `a${String(index + 12).padStart(3, "0")}`;
  const fit = 34 + Math.floor(rand() * 62);
  const headcount = 40 + Math.floor(rand() * 900);
  const stage = pick(STAGES);

  const stack = [pick(COMPLEMENTS)];
  if (rand() > 0.6) stack.push(pick(COMPETITORS));
  if (rand() > 0.5) stack.push(pick(COMPLEMENTS));

  const execs: ExecSeat[] = [seat(pick(RELEVANT), "VP Engineering")];
  if (rand() > 0.5) execs.push(seat(pick(OTHER_FNS), "VP Marketing"));

  const base = state({
    headcount,
    funding_stage: stage,
    funding_total_usd: [3, 14, 45, 120][STAGES.indexOf(stage)]! * 1_000_000,
    stack: [...new Set(stack)],
    execs,
    tagline: `${name.split(" ")[0]} for ${industry.toLowerCase()}`,
    homepage_hash: `home-${index}-1`,
    pricing_page_hash: `price-${index}-1`,
  });

  const mutate: Partial<Record<number, Partial<ObservedState>>> = {};
  const items: Partial<Record<number, ObservedItem[]>> = {};

  // Roughly a fifth of the middle is genuinely quiet, which is what a real account
  // list looks like and what keeps `quiet` from feeling like a bug.
  if (rand() > 0.8) return { account: account(id, name, industry, fit), base, mutate, items };

  const at = 3 + Math.floor(rand() * 8); // crawl index 3..10
  const roll = rand();

  if (roll < 0.2) {
    const next = STAGES[Math.min(STAGES.length - 1, STAGES.indexOf(stage) + 1)]!;
    mutate[at] = {
      funding_stage: next,
      funding_total_usd: [3, 14, 45, 120][STAGES.indexOf(next)]! * 1_000_000,
    };
  } else if (roll < 0.4) {
    mutate[at] = { headcount: Math.round(headcount * (1.2 + rand() * 0.5)) };
    items[at] = jobPosts(DATES[at - 1]!, DATES[at]!, pick(RELEVANT), 3 + Math.floor(rand() * 4));
  } else if (roll < 0.55) {
    mutate[at] = { execs: [...execs, seat(pick(RELEVANT), "Head of Platform")] };
  } else if (roll < 0.7) {
    const added = pick(rand() > 0.5 ? COMPLEMENTS : COMPETITORS);
    mutate[at] = { stack: [...new Set([...base.stack, added])] };
  } else if (roll < 0.82) {
    mutate[at] = { tagline: `${name.split(" ")[0]}, reimagined`, homepage_hash: `home-${index}-2` };
    items[at] = releases(DATES[at - 1]!, DATES[at]!, [`${name.split(" ")[0]} 2.0`]);
  } else if (roll < 0.92) {
    items[at] = jobPosts(DATES[at - 1]!, DATES[at]!, pick(OTHER_FNS), 2 + Math.floor(rand() * 3));
  } else {
    mutate[at] = { headcount: Math.round(headcount * 0.85) };
  }

  return { account: account(id, name, industry, fit), base, mutate, items };
}

// ---------------------------------------------------------------------------
// assemble
// ---------------------------------------------------------------------------

function observationsFor(recipe: Recipe): Observation[] {
  const absent = new Set(recipe.absent ?? []);
  let current: ObservedState = recipe.base;
  const out: Observation[] = [];

  for (let i = 0; i < DATES.length; i += 1) {
    const patch = recipe.mutate?.[i];
    if (patch) current = { ...current, ...patch };
    if (absent.has(i)) continue;
    out.push({
      account_id: recipe.account.id,
      observed_at: DATES[i]!,
      state: { ...current, stack: [...current.stack], execs: current.execs.map((e) => ({ ...e })) },
      items: (recipe.items?.[i] ?? []).map((item) => ({ ...item })),
    });
  }
  return out;
}

const recipes: Recipe[] = [
  ...ENGINEERED,
  ...MIDDLE_NAMES.map((_, index) => middleRecipe(index)),
];

const accounts = recipes.map((recipe) => recipe.account);
const observations = recipes.flatMap(observationsFor);

const dataDir = join(import.meta.dirname, "..", "data");
writeFileSync(join(dataDir, "accounts.json"), `${JSON.stringify(accounts, null, 2)}\n`);
writeFileSync(join(dataDir, "observations.json"), `${JSON.stringify(observations, null, 2)}\n`);

console.log(
  `${accounts.length} accounts, ${observations.length} observations, ${DATES.length} crawl dates`,
);
console.log(`range ${DATES[0]} → ${DATES[DATES.length - 1]}`);
