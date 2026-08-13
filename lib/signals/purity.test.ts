import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The load-bearing constraint of this codebase: `lib/signals/**` imports nothing
 * non-relative. Not `next`, not `react`, not `zod`, not `@/data`.
 *
 * There is no allowlist, deliberately. If the engine needs a package, the code
 * belongs in `lib/watchlist/` or a route handler — widening this rule is how a
 * pure engine quietly becomes a framework-coupled one. Three things depend on it:
 * the engine is testable with no harness, Day 007 `why-now` imports it unchanged,
 * and the client can run it on every scrub frame without shipping Zod.
 *
 * Test files are excluded from the scan: they import `vitest` and `node:fs`, and
 * they are not part of what ships.
 */

const ENGINE_DIR = join(process.cwd(), "lib", "signals");

/** `import … from "x"`, `export … from "x"`, `import("x")`, and bare `import "x"`. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (!entry.endsWith(".ts")) continue;
    if (entry.endsWith(".test.ts")) continue;
    found.push(path);
  }
  return found;
}

function specifiersIn(source: string): string[] {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, "");
  return [...withoutLineComments.matchAll(SPECIFIER)].map((match) => match[1] ?? "");
}

describe("engine purity", () => {
  const files = sourceFiles(ENGINE_DIR);

  it("finds engine source to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [file.slice(process.cwd().length + 1), file] as const))(
    "%s imports only relative paths",
    (_label, file) => {
      const offenders = specifiersIn(readFileSync(file, "utf8")).filter(
        (specifier) => !specifier.startsWith("."),
      );
      expect(offenders).toEqual([]);
    },
  );
});
