"use client";

import { useState } from "react";

import { PRESETS } from "@/data/presets";
import { FAMILIES, FUNCTIONS, WEIGHT_KEYS } from "@/lib/signals/types";
import type { Family, Fn, Watchlist, WeightKey } from "@/lib/signals/types";

import { FAMILY_STYLE, SectionTitle } from "./ui";

/**
 * The ruler, editable.
 *
 * Caps are editable and the engine deliberately does **not** renormalise them: if you set them
 * so they sum to 140, the board reads `72 / 140`. Renormalising would put a division back into
 * the scoring path, which is the thing the cap design exists to avoid.
 */

const WEIGHT_LABEL: Record<WeightKey, string> = {
  funding_round: "Funding round",
  exec_change: "Exec arrives",
  exec_change_loss: "Exec leaves",
  key_role_opened: "Key role opened",
  hiring_surge: "Hiring surge",
  headcount_growth: "Headcount growth",
  headcount_contraction: "Headcount contraction",
  stack_dropped: "Competitor dropped",
  stack_added: "Complement added",
  stack_added_competitor: "Competitor added",
  positioning_change: "Positioning change",
  product_launch: "Product launch",
};

const NEGATIVE_KEYS = new Set<WeightKey>([
  "headcount_contraction",
  "stack_added_competitor",
  "exec_change_loss",
]);

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className="w-16 rounded border border-slate-200 bg-transparent px-1.5 py-0.5 text-right font-mono tabular-nums dark:border-slate-700"
        />
        {suffix ? <span className="w-4 text-[10px] text-slate-400">{suffix}</span> : null}
      </span>
    </label>
  );
}

function TokenList({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <input
        value={values.join(", ")}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((token) => token.trim())
              .filter((token) => token.length > 0),
          )
        }
        className="rounded border border-slate-200 bg-transparent px-2 py-1 font-mono text-[11px] dark:border-slate-700"
      />
    </label>
  );
}

export function WatchlistPanel({
  watchlist,
  parseAvailable,
  onChange,
}: {
  watchlist: Watchlist;
  parseAvailable: boolean;
  onChange: (next: Watchlist) => void;
}) {
  const [prose, setProse] = useState("");
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const denominator = FAMILIES.reduce((sum, family) => sum + watchlist.families[family].cap, 0);

  const setFamily = (family: Family, patch: { cap?: number; half_life_days?: number }) =>
    onChange({
      ...watchlist,
      families: { ...watchlist.families, [family]: { ...watchlist.families[family], ...patch } },
    });

  async function parse() {
    setParsing(true);
    setMessage(null);
    setWarnings([]);
    try {
      const response = await fetch("/api/parse-watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prose, base: watchlist }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "That did not work.");
        return;
      }
      onChange(body.watchlist);
      setWarnings(body.warnings ?? []);
      setMessage("Draft applied. Everything below is editable — check it before you trust the board.");
    } catch {
      setMessage("The request failed. The panel below still works without it.");
    } finally {
      setParsing(false);
    }
  }

  return (
    <aside className="flex w-full flex-col gap-5 rounded-lg border border-slate-200 p-4 lg:w-80 lg:shrink-0 dark:border-slate-800">
      <div className="flex flex-col gap-2">
        <SectionTitle hint="Presets covering three motions. Between them they fire all ten detectors.">
          Watchlist
        </SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => onChange(preset)}
              className={`rounded border px-2 py-1 text-[11px] ${
                preset.name === watchlist.name
                  ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                  : "border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle hint="Describe what you care about. The model writes configuration only — it never sees an account and never touches a score.">
          Describe it instead
        </SectionTitle>
        {parseAvailable ? (
          <>
            <textarea
              value={prose}
              onChange={(event) => setProse(event.target.value)}
              rows={3}
              placeholder="We sell observability to Series B data teams. I care most when they lose an engineering leader or drop a competitor."
              className="rounded border border-slate-200 bg-transparent px-2 py-1.5 text-xs dark:border-slate-700"
            />
            <button
              type="button"
              disabled={parsing || prose.trim().length < 10}
              onClick={parse}
              className="self-start rounded bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {parsing ? "Reading…" : "Draft a watchlist"}
            </button>
          </>
        ) : (
          <p className="text-[11px] text-slate-500">
            No <code className="font-mono">GEMINI_API_KEY</code> on this server, so the prose
            shortcut is off. Everything else works — the whole board is arithmetic and needs no key.
          </p>
        )}
        {message ? <p className="text-[11px] text-slate-600 dark:text-slate-400">{message}</p> : null}
        {warnings.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {warnings.map((warning) => (
              <li key={warning} className="text-[11px] text-amber-700 dark:text-amber-400">
                {warning}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle
          hint={`Caps sum to ${denominator}${denominator === 100 ? "" : " — the board will say so rather than rescale"}. Half-life is how long a signal takes to lose half its weight.`}
        >
          Families
        </SectionTitle>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="font-medium">Family</th>
              <th className="text-right font-medium">Cap</th>
              <th className="text-right font-medium">Half-life</th>
            </tr>
          </thead>
          <tbody>
            {FAMILIES.map((family) => (
              <tr key={family}>
                <td className={`py-0.5 ${FAMILY_STYLE[family].text}`}>{FAMILY_STYLE[family].label}</td>
                <td className="py-0.5 text-right">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={watchlist.families[family].cap}
                    onChange={(event) => setFamily(family, { cap: Number(event.target.value) })}
                    className="w-14 rounded border border-slate-200 bg-transparent px-1 py-0.5 text-right font-mono tabular-nums dark:border-slate-700"
                  />
                </td>
                <td className="py-0.5 text-right">
                  <input
                    type="number"
                    min={1}
                    max={730}
                    value={watchlist.families[family].half_life_days}
                    onChange={(event) =>
                      setFamily(family, { half_life_days: Number(event.target.value) })
                    }
                    className="w-14 rounded border border-slate-200 bg-transparent px-1 py-0.5 text-right font-mono tabular-nums dark:border-slate-700"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="flex flex-col gap-2">
        <summary className="cursor-pointer text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Signal weights
        </summary>
        <div className="mt-2 flex flex-col gap-1">
          <p className="mb-1 text-[11px] text-slate-500">
            Magnitudes only. Direction supplies the sign, so a contraction cannot be turned into
            good news by typing a positive number.
          </p>
          {WEIGHT_KEYS.map((key) => (
            <NumberField
              key={key}
              label={`${WEIGHT_LABEL[key]}${NEGATIVE_KEYS.has(key) ? " (counts against)" : ""}`}
              value={watchlist.weights[key]}
              min={0}
              max={200}
              onChange={(next) =>
                onChange({ ...watchlist, weights: { ...watchlist.weights, [key]: next } })
              }
            />
          ))}
        </div>
      </details>

      <details className="flex flex-col gap-2">
        <summary className="cursor-pointer text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Thresholds
        </summary>
        <div className="mt-2 flex flex-col gap-1">
          <NumberField
            label="Surge needs at least"
            suffix="posts"
            min={1}
            max={100}
            value={watchlist.thresholds.surge_min_posts}
            onChange={(surge_min_posts) =>
              onChange({ ...watchlist, thresholds: { ...watchlist.thresholds, surge_min_posts } })
            }
          />
          <NumberField
            label="…within"
            suffix="days"
            min={1}
            max={365}
            value={watchlist.thresholds.surge_window_days}
            onChange={(surge_window_days) =>
              onChange({ ...watchlist, thresholds: { ...watchlist.thresholds, surge_window_days } })
            }
          />
          <NumberField
            label="Growth threshold"
            suffix="%"
            min={0}
            max={500}
            value={watchlist.thresholds.growth_min_pct}
            onChange={(growth_min_pct) =>
              onChange({ ...watchlist, thresholds: { ...watchlist.thresholds, growth_min_pct } })
            }
          />
          <NumberField
            label="Contraction threshold"
            suffix="%"
            min={0}
            max={100}
            value={watchlist.thresholds.contraction_min_pct}
            onChange={(contraction_min_pct) =>
              onChange({
                ...watchlist,
                thresholds: { ...watchlist.thresholds, contraction_min_pct },
              })
            }
          />
          <NumberField
            label="Refractory window"
            suffix="days"
            min={0}
            max={730}
            value={watchlist.thresholds.refractory_days}
            onChange={(refractory_days) =>
              onChange({ ...watchlist, thresholds: { ...watchlist.thresholds, refractory_days } })
            }
          />
          <NumberField
            label="Escalation factor"
            suffix="×"
            min={1}
            max={100}
            value={watchlist.thresholds.escalation_factor}
            onChange={(escalation_factor) =>
              onChange({ ...watchlist, thresholds: { ...watchlist.thresholds, escalation_factor } })
            }
          />
          <NumberField
            label="Horizon"
            suffix="× hl"
            min={1}
            max={20}
            value={watchlist.thresholds.horizon_half_lives}
            onChange={(horizon_half_lives) =>
              onChange({
                ...watchlist,
                thresholds: { ...watchlist.thresholds, horizon_half_lives },
              })
            }
          />
          <NumberField
            label="Trend window"
            suffix="days"
            min={1}
            max={365}
            value={watchlist.thresholds.trend_window_days}
            onChange={(trend_window_days) =>
              onChange({ ...watchlist, thresholds: { ...watchlist.thresholds, trend_window_days } })
            }
          />
          <NumberField
            label="Act-now line"
            min={0}
            max={200}
            value={watchlist.act_now_at}
            onChange={(act_now_at) => onChange({ ...watchlist, act_now_at })}
          />
        </div>
      </details>

      <div className="flex flex-col gap-2">
        <SectionTitle hint="Who you sell to, and whose tools mean what. A tool on neither list carries no weight and says so.">
          Relevance
        </SectionTitle>
        <fieldset className="flex flex-wrap gap-1">
          {FUNCTIONS.map((fn) => {
            const on = watchlist.relevant_functions.includes(fn);
            return (
              <button
                key={fn}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    ...watchlist,
                    relevant_functions: on
                      ? watchlist.relevant_functions.filter((candidate) => candidate !== fn)
                      : [...watchlist.relevant_functions, fn as Fn],
                  })
                }
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  on
                    ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {fn.replace("_", " ")}
              </button>
            );
          })}
        </fieldset>
        <TokenList
          label="Competitor tools"
          values={watchlist.competitor_tools}
          placeholder="Rivalytics, Sentrylight"
          onChange={(competitor_tools) => onChange({ ...watchlist, competitor_tools })}
        />
        <TokenList
          label="Complement tools"
          values={watchlist.complement_tools}
          placeholder="Warehowse, Terraflow"
          onChange={(complement_tools) => onChange({ ...watchlist, complement_tools })}
        />
      </div>
    </aside>
  );
}
