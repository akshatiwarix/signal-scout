import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { z } from "zod";

import { FAMILIES, FUNCTIONS } from "../signals/types";
import type { Family, Fn, Watchlist } from "../signals/types";

/**
 * The only file in this repository that talks to a model, and the only thing the model is
 * allowed to write: **a watchlist**.
 *
 * The invariant, restated for this repo: *the model tunes the ruler, it never reads the
 * measurement.* Prose goes in, a draft configuration comes out, the user reviews and edits
 * it in the panel, and only then does arithmetic happen over visible data. No score, no
 * ranking and no reason string on the board has ever been near a language model — which is
 * the whole engineering claim, and a "let the model judge the signal" shortcut destroys it.
 *
 * Two hard-won shapes carried over from Day 001, both of which cost debugging time there:
 *
 * - **The wire format is flatter than the type it becomes.** Gemini's response schema has no
 *   unions, no tuples and no records, so it cannot express `Record<Family, {cap, half_life}>`.
 *   The model fills fixed arrays of `{ family, emphasis }` and `toWatchlist` assembles the
 *   real structure. Do not "simplify" this back towards the internal type.
 * - **Bad output is dropped and reported, never repaired.** An unknown function name, a
 *   family that appears twice, a threshold out of range — each is discarded with a warning
 *   the UI shows. Silently fixing it would put a criterion in front of the user that they
 *   never asked for and cannot see.
 */

const MODEL = "gemini-3.6-flash";

/** Emphasis buckets rather than raw point caps: a model cannot be trusted to sum to 100. */
const EMPHASIS_WEIGHT: Record<string, number> = { high: 3, normal: 2, low: 1, ignore: 0 };

const draftSchema = z.object({
  name: z.string().min(1).max(80),
  emphasis: z
    .array(z.object({ family: z.string(), emphasis: z.string() }))
    .max(10),
  relevant_functions: z.array(z.string()).max(20),
  competitor_tools: z.array(z.string().min(1).max(60)).max(30),
  complement_tools: z.array(z.string().min(1).max(60)).max(30),
  act_now_at: z.number(),
});

export type WatchlistDraft = z.infer<typeof draftSchema>;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Short name for this watchlist, 2-4 words" },
    emphasis: {
      type: Type.ARRAY,
      description: "One entry per signal family the user cares about",
      items: {
        type: Type.OBJECT,
        properties: {
          family: { type: Type.STRING, enum: [...FAMILIES] },
          emphasis: { type: Type.STRING, enum: ["high", "normal", "low", "ignore"] },
        },
        required: ["family", "emphasis"],
      },
    },
    relevant_functions: {
      type: Type.ARRAY,
      description: "Business functions the user sells to",
      items: { type: Type.STRING, enum: [...FUNCTIONS] },
    },
    competitor_tools: {
      type: Type.ARRAY,
      description: "Tools that compete with what the user sells",
      items: { type: Type.STRING },
    },
    complement_tools: {
      type: Type.ARRAY,
      description: "Tools that indicate a good technical fit",
      items: { type: Type.STRING },
    },
    act_now_at: {
      type: Type.INTEGER,
      description: "Score at or above which an account is worth contacting today, 5-60",
    },
  },
  required: ["name", "emphasis", "relevant_functions", "competitor_tools", "complement_tools", "act_now_at"],
} as const;

const SYSTEM_PROMPT = `You configure a signal-monitoring watchlist for a B2B sales team.

The user describes what they sell and which account events matter to them. Translate that into
configuration only. You are not scoring anything and you never see the accounts.

The five signal families are:
- money: funding rounds
- people: leadership arriving or leaving
- growth: hiring and headcount
- technology: tools entering or leaving an account's stack
- market: launches and repositioning

Rules:
- Only include a family in "emphasis" if the user's description implies something about it.
- "relevant_functions" is who they sell to, not who works there generally.
- Only list a tool as a competitor if the user says it competes with them.
- act_now_at: scores in this system rarely exceed 35, so a sensible threshold is 15-25.`;

export interface ParseResult {
  watchlist: Watchlist;
  warnings: string[];
}

export type ParseOutcome =
  | { ok: true; result: ParseResult }
  | { ok: false; error: string; status: number };

/**
 * Assembles a real watchlist from the flat draft, starting from `base` so that anything the
 * model did not mention keeps a sane default rather than a zero.
 */
export function toWatchlist(draft: WatchlistDraft, base: Watchlist): ParseResult {
  const warnings: string[] = [];

  const weights = new Map<Family, number>();
  for (const entry of draft.emphasis) {
    const family = FAMILIES.find((candidate) => candidate === entry.family);
    if (!family) {
      warnings.push(`Dropped an emphasis for "${entry.family}" — not one of the five families.`);
      continue;
    }
    const weight = EMPHASIS_WEIGHT[entry.emphasis.toLowerCase()];
    if (weight === undefined) {
      warnings.push(`Dropped "${entry.family}: ${entry.emphasis}" — emphasis must be high, normal, low or ignore.`);
      continue;
    }
    if (weights.has(family)) {
      warnings.push(`Ignored a second emphasis for ${family}; kept the first.`);
      continue;
    }
    weights.set(family, weight);
  }

  // Families the model said nothing about keep a middling weight, so an unmentioned family
  // is de-emphasised rather than deleted.
  for (const family of FAMILIES) if (!weights.has(family)) weights.set(family, 1);

  const totalWeight = FAMILIES.reduce((sum, family) => sum + (weights.get(family) ?? 0), 0);
  const caps = new Map<Family, number>();

  if (totalWeight === 0) {
    warnings.push("Every family was set to ignore, so the preset's caps were kept instead.");
    for (const family of FAMILIES) caps.set(family, base.families[family].cap);
  } else {
    // Integer caps that still sum to 100: floor everything, then hand the remainder to the
    // heaviest family. No division survives into the engine — this happens once, here.
    let assigned = 0;
    for (const family of FAMILIES) {
      const cap = Math.floor((100 * (weights.get(family) ?? 0)) / totalWeight);
      caps.set(family, cap);
      assigned += cap;
    }
    const heaviest = [...FAMILIES].sort(
      (a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0) || a.localeCompare(b),
    )[0];
    if (heaviest) caps.set(heaviest, (caps.get(heaviest) ?? 0) + (100 - assigned));
  }

  const functions: Fn[] = [];
  for (const raw of draft.relevant_functions) {
    const fn = FUNCTIONS.find((candidate) => candidate === raw);
    if (!fn) {
      warnings.push(`Dropped the function "${raw}" — not one this system knows about.`);
      continue;
    }
    if (!functions.includes(fn)) functions.push(fn);
  }
  if (functions.length === 0) {
    warnings.push("No usable functions came back, so the preset's list was kept.");
  }

  const overlap = draft.competitor_tools.filter((tool) => draft.complement_tools.includes(tool));
  for (const tool of overlap) {
    warnings.push(`"${tool}" was listed as both a competitor and a complement; kept it as a competitor.`);
  }

  let act_now_at = Math.round(draft.act_now_at);
  if (!Number.isFinite(act_now_at) || act_now_at < 1 || act_now_at > 100) {
    warnings.push(`Ignored an act-now threshold of ${draft.act_now_at}; kept ${base.act_now_at}.`);
    act_now_at = base.act_now_at;
  }

  return {
    warnings,
    watchlist: {
      name: draft.name,
      families: Object.fromEntries(
        FAMILIES.map((family) => [
          family,
          { cap: caps.get(family) ?? 0, half_life_days: base.families[family].half_life_days },
        ]),
      ) as Watchlist["families"],
      weights: { ...base.weights },
      thresholds: { ...base.thresholds },
      relevant_functions: functions.length > 0 ? functions : [...base.relevant_functions],
      competitor_tools: [...new Set(draft.competitor_tools)],
      complement_tools: [...new Set(draft.complement_tools)].filter(
        (tool) => !draft.competitor_tools.includes(tool),
      ),
      act_now_at,
    },
  };
}

export function isConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function parseWatchlist(prose: string, base: Watchlist): Promise<ParseOutcome> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 501,
      error:
        "No GEMINI_API_KEY is configured on this server. Everything else works without it — build the watchlist in the panel instead.",
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  let text: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prose,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        // Constrained extraction against a fixed schema, not reasoning. Day 001 measured this
        // taking thought tokens from 135 to 0 on a real parse; the free tier's quota is
        // per-minute, so thinking overhead directly costs the live demo its throughput.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
    text = response.text;
  } catch (cause) {
    return {
      ok: false,
      status: 502,
      error: `The model call failed: ${cause instanceof Error ? cause.message : "unknown error"}`,
    };
  }

  if (!text) {
    return { ok: false, status: 502, error: "The model returned an empty response." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: 502, error: "The model returned something that is not JSON." };
  }

  // Native structured output constrains generation; Zod is the trust boundary. Both, because
  // a schema is a request and a validator is a guarantee.
  const draft = draftSchema.safeParse(parsed);
  if (!draft.success) {
    return {
      ok: false,
      status: 502,
      error: `The model's configuration did not match the expected shape: ${draft.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    };
  }

  return { ok: true, result: toWatchlist(draft.data, base) };
}
