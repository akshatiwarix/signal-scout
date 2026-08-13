import { buildBoard } from "@/lib/signals";
import { buildBoardInputSchema } from "@/lib/watchlist/schema";

/**
 * The programmatic surface. Validates, calls `buildBoard`, serialises — and contains no
 * detection, decay or scoring logic of its own; keep it that way.
 *
 * The UI does **not** go through here for scrubbing. The engine is dependency-free, so the
 * client imports it and recomputes locally on every frame of the date slider, because a
 * request per frame is a stutter per frame. This route exists for pasted observations and for
 * anyone treating the project as an API, and `equivalence.test.ts` is what guarantees the two
 * paths agree.
 */

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return Response.json(
      { error: `Body is larger than ${MAX_BODY_BYTES / 1000}KB. Send fewer observations.` },
      { status: 413 },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json(
      { error: `Body is larger than ${MAX_BODY_BYTES / 1000}KB. Send fewer observations.` },
      { status: 413 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "That is not valid JSON." }, { status: 400 });
  }

  const input = buildBoardInputSchema.safeParse(json);
  if (!input.success) {
    // Issue paths are returned verbatim (`observations.3.state.headcount`) so the paste panel
    // can point at the offending row instead of saying "invalid input".
    return Response.json(
      {
        error: "The request did not match the expected shape.",
        issues: input.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const accountIds = new Set(input.data.accounts.map((account) => account.id));
  const orphans = [
    ...new Set(
      input.data.observations
        .map((observation) => observation.account_id)
        .filter((id) => !accountIds.has(id)),
    ),
  ];

  if (orphans.length > 0) {
    return Response.json(
      {
        error: `Observations reference ${orphans.length} account${orphans.length === 1 ? "" : "s"} that are not in the accounts list.`,
        issues: orphans.slice(0, 10).map((id) => ({ path: "observations", message: `unknown account_id "${id}"` })),
      },
      { status: 400 },
    );
  }

  return Response.json(buildBoard(input.data));
}
