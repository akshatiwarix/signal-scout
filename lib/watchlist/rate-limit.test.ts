import { describe, expect, it } from "vitest";

import { clientKey, createRateLimiter } from "./rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit and then refuses with a retry hint", () => {
    let now = 1_000_000;
    const take = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });

    expect(take("1.1.1.1").allowed).toBe(true);
    expect(take("1.1.1.1").allowed).toBe(true);
    expect(take("1.1.1.1")).toEqual({ allowed: true, remaining: 0, retry_after_seconds: 60 });

    const refused = take("1.1.1.1");
    expect(refused.allowed).toBe(false);
    expect(refused.retry_after_seconds).toBe(60);

    now += 30_000;
    expect(take("1.1.1.1").retry_after_seconds).toBe(30);
  });

  it("keeps callers in separate buckets", () => {
    const take = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(take("1.1.1.1").allowed).toBe(true);
    expect(take("2.2.2.2").allowed).toBe(true);
    expect(take("1.1.1.1").allowed).toBe(false);
  });

  it("opens a fresh window once the old one has passed", () => {
    let now = 0;
    const take = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });

    expect(take("1.1.1.1").allowed).toBe(true);
    expect(take("1.1.1.1").allowed).toBe(false);

    now = 60_000;
    expect(take("1.1.1.1").allowed).toBe(true);
  });
});

describe("client key", () => {
  it("takes the left-most forwarded address, which is the client", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientKey(headers)).toBe("203.0.113.7");
  });

  it("falls back to a shared bucket rather than throwing", () => {
    expect(clientKey(new Headers())).toBe("local");
  });
});
