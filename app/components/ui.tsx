import type { Family, FitBand, LifecycleState, SparkPoint } from "@/lib/signals/types";

/** Shared presentational bits. No logic that affects a number lives in here. */

export const FAMILY_STYLE: Record<Family, { bar: string; text: string; label: string }> = {
  money: { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", label: "Money" },
  people: { bar: "bg-violet-500", text: "text-violet-700 dark:text-violet-400", label: "People" },
  growth: { bar: "bg-sky-500", text: "text-sky-700 dark:text-sky-400", label: "Growth" },
  technology: { bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", label: "Technology" },
  market: { bar: "bg-rose-500", text: "text-rose-700 dark:text-rose-400", label: "Market" },
};

const STATE_STYLE: Record<LifecycleState, { chip: string; label: string; hint: string }> = {
  rising: {
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    label: "Rising",
    hint: "scoring higher than it was two weeks ago",
  },
  cooling: {
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    label: "Cooling",
    hint: "still active, but worth less than it was two weeks ago",
  },
  steady: {
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    label: "Steady",
    hint: "unchanged over the trend window",
  },
  stale: {
    chip: "border border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400",
    label: "Stale",
    hint: "had signals once; every one of them is now past the horizon",
  },
  quiet: {
    chip: "text-slate-400 dark:text-slate-500",
    label: "Quiet",
    hint: "nothing has ever fired for this account in the window watched",
  },
  contracting: {
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    label: "Contracting",
    hint: "net negative — this account is going the wrong way",
  },
};

export function StateChip({ state }: { state: LifecycleState }) {
  const style = STATE_STYLE[state];
  return (
    <span
      title={style.hint}
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${style.chip}`}
    >
      {style.label}
    </span>
  );
}

const FIT_STYLE: Record<FitBand, string> = {
  strong: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  moderate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  weak: "border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400",
};

export function FitChip({ band, score }: { band: FitBand; score: number }) {
  return (
    <span
      title={`ICP fit ${score}/100 — supplied as data, never blended into the signal score`}
      className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] ${FIT_STYLE[band]}`}
    >
      {score}
    </span>
  );
}

/**
 * The score bar. Negative totals grow leftwards from the zero mark, because a contracting
 * account is not "a small amount of good" and should not look like one.
 */
export function ScoreBar({
  total,
  denominator,
  actNowAt,
}: {
  total: number;
  denominator: number;
  actNowAt: number;
}) {
  const floor = 25;
  const span = denominator + floor;
  const zero = (floor / span) * 100;
  const width = (Math.abs(total) / span) * 100;
  const threshold = ((floor + actNowAt) / span) * 100;

  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className={`absolute top-0 h-full ${total < 0 ? "bg-rose-500" : "bg-indigo-500"}`}
        style={
          total < 0
            ? { right: `${100 - zero}%`, width: `${width}%` }
            : { left: `${zero}%`, width: `${width}%` }
        }
      />
      <div
        className="absolute top-0 h-full w-px bg-slate-400 dark:bg-slate-500"
        style={{ left: `${zero}%` }}
      />
      <div
        title={`act-now line at ${actNowAt}`}
        className="absolute top-0 h-full w-px bg-indigo-900/40 dark:bg-indigo-300/50"
        style={{ left: `${threshold}%` }}
      />
    </div>
  );
}

/**
 * Family contributions as one stacked strip — the shape of *why* a total is what it is.
 *
 * The strip's **overall width** tracks magnitude and its **segments** show composition. Both
 * are needed: a strip normalised to full width made a one-point account look exactly as loud
 * as a twenty-eight-point one, which is the same lie a feed tells.
 */
export function FamilyStrip({
  families,
  scaleAgainst,
}: {
  families: { family: Family; points: number; cap: number }[];
  /** The largest absolute total on the board, so widths are comparable row to row. */
  scaleAgainst: number;
}) {
  const active = families.filter((family) => family.points !== 0);
  if (active.length === 0) {
    return <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>;
  }

  const magnitude = active.reduce((sum, family) => sum + Math.abs(family.points), 0);
  const width = Math.max(6, (magnitude / Math.max(1, scaleAgainst)) * 100);

  return (
    <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full">
      <div className="flex h-full gap-px overflow-hidden rounded-full" style={{ width: `${width}%` }}>
        {active.map((family) => (
          <div
            key={family.family}
            title={`${FAMILY_STYLE[family.family].label} ${family.points > 0 ? "+" : ""}${family.points} of ${family.cap}`}
            className={`${family.points < 0 ? "bg-rose-400" : FAMILY_STYLE[family.family].bar} first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${(Math.abs(family.points) / magnitude) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The trajectory, drawn from totals the engine already computed at weekly intervals. This is
 * what makes Rising and Cooling legible rather than a label you have to trust.
 */
export function Sparkline({ points, total }: { points: SparkPoint[]; total: number }) {
  if (points.length < 2) {
    return <div className="h-5 w-16" aria-hidden />;
  }

  const width = 64;
  const height = 20;
  const values = points.map((point) => point.total);
  const max = Math.max(4, ...values.map(Math.abs));
  const step = width / (points.length - 1);

  const path = values
    .map((value, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)},${(height / 2 - (value / max) * (height / 2 - 1)).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      role="img"
      aria-label={`score trajectory, now ${total}`}
    >
      <line
        x1="0"
        y1={height / 2}
        x2={width}
        y2={height / 2}
        className="stroke-slate-200 dark:stroke-slate-700"
        strokeWidth="1"
      />
      <path
        d={path}
        fill="none"
        className={total < 0 ? "stroke-rose-500" : "stroke-indigo-500"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {children}
      </h2>
      {hint ? <p className="text-[11px] text-slate-500 dark:text-slate-500">{hint}</p> : null}
    </div>
  );
}
