import type { Account, Observation } from "@/lib/signals/types";

import accountsJson from "./accounts.json";
import observationsJson from "./observations.json";

/**
 * The same two JSON files as `dataset.ts`, without the Zod pass.
 *
 * This module exists so a **client** component can hand the dataset to the engine without
 * pulling Zod into the browser bundle. The validation is not skipped, only moved: `dataset.ts`
 * parses these exact files at import time on the server, so a malformed edit fails the build
 * before this cast can ever be wrong.
 */
export const CLIENT_ACCOUNTS = accountsJson as Account[];
export const CLIENT_OBSERVATIONS = observationsJson as Observation[];
