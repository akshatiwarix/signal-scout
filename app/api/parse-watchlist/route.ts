import { z } from "zod";

import { isConfigured, parseWatchlist } from "@/lib/watchlist/parse";
import { clientKey, createRateLimiter } from "@/lib/watchlist/rate-limit";
import { watchlistSchema } from "@/lib/watchlist/schema";

/**
 * Prose → watchlist draft. The only route that spends a model quota, and the only one that is
 * rate limited: the deterministic board is arithmetic over bundled data and needs no ceiling.
 */

const take = createRateLimiter({ limit: 5, windowMs: 60_000 });

const bodySchema = z.object({
  prose: z.string().min(10).max(2_000),
  /** The watchlist to start from, so anything the model omits keeps a sane default. */
  base: watchlistSchema,
});

export async function POST(request: Request): Promise<Response> {
  // The unconfigured-key check runs *before* the limiter. A server with no key should say so
  // every time, rather than eventually answering "too many requests" to a question it was
  // never able to answer in the first place.
  if (!isConfigured()) {
    return Response.json(
      {
        error:
          "No GEMINI_API_KEY is configured on this server. Everything else works without it — build the watchlist in the panel instead.",
      },
      { status: 501 },
    );
  }

  const limit = take(clientKey(request.headers));
  if (!limit.allowed) {
    return Response.json(
      { error: `Five parses a minute. Try again in ${limit.retry_after_seconds}s.` },
      { status: 429, headers: { "retry-after": String(limit.retry_after_seconds) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "That is not valid JSON." }, { status: 400 });
  }

  const body = bodySchema.safeParse(json);
  if (!body.success) {
    return Response.json(
      {
        error: "The request did not match the expected shape.",
        issues: body.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const outcome = await parseWatchlist(body.data.prose, body.data.base);
  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: outcome.status });
  }

  return Response.json(
    { watchlist: outcome.result.watchlist, warnings: outcome.result.warnings },
    { headers: { "x-ratelimit-remaining": String(limit.remaining) } },
  );
}
