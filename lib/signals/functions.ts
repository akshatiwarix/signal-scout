import type { Fn } from "./types";

/**
 * Maps a job title to a business function with a keyword table.
 *
 * This is deliberately shallow. Real title normalization — seniority parsing,
 * regional variants, the fact that "Solutions Architect" means four different jobs
 * — is Day 011 `title-normalizer`. What this needs to do is decide whether a post
 * belongs to a function the user sells to, and be honest when it cannot tell.
 *
 * Order matters: the table is scanned top to bottom and the first hit wins, so more
 * specific phrases must precede the words they contain. "Data Platform Engineer" has
 * to reach `data` before `engineering` claims it on the word "engineer".
 */

const TABLE: [Fn, string[]][] = [
  ["revops", ["revenue operations", "revops", "sales operations", "sales systems", "gtm systems"]],
  ["data", ["data engineer", "analytics engineer", "data platform", "data scientist", "machine learning", "analytics", "data "]],
  ["security", ["security", "appsec", "infosec", "ciso", "compliance engineer"]],
  ["it", ["it operations", "it support", "systems administrator", "sysadmin", "helpdesk", "endpoint"]],
  ["engineering", ["engineer", "engineering", "developer", "sre", "devops", "platform", "architect", "cto"]],
  ["product", ["product manager", "product owner", "head of product", "vp product", "cpo"]],
  ["design", ["designer", "design", "ux", "ui "]],
  ["marketing", ["marketing", "demand generation", "growth marketer", "content", "brand", "cmo"]],
  ["sales", ["account executive", "sales development", "sdr", "bdr", "sales rep", "cro", "sales manager"]],
  ["customer_success", ["customer success", "account manager", "support engineer", "onboarding"]],
  ["finance", ["finance", "accountant", "accounting", "controller", "cfo", "fp&a"]],
  ["people", ["recruiter", "recruiting", "talent", "people operations", "human resources", "chro"]],
  ["operations", ["operations", "supply", "logistics coordinator", "business operations", "coo"]],
  ["legal", ["counsel", "legal", "paralegal", "privacy"]],
];

/** The department string a job board reported, when it reported one, matched exactly. */
const DEPARTMENTS: Record<string, Fn> = {
  engineering: "engineering",
  data: "data",
  security: "security",
  it: "it",
  product: "product",
  design: "design",
  marketing: "marketing",
  sales: "sales",
  "revenue operations": "revops",
  "customer success": "customer_success",
  finance: "finance",
  people: "people",
  operations: "operations",
  legal: "legal",
};

/**
 * Returns `null` rather than guessing. A post that cannot be placed is reported as
 * unplaced in the signal's detail, because silently filing it under `engineering`
 * would inflate `key_role_opened` for every user who sells to engineers.
 */
export function functionForTitle(title: string, department: string | null): Fn | null {
  if (department) {
    const exact = DEPARTMENTS[department.trim().toLowerCase()];
    if (exact) return exact;
  }

  const haystack = ` ${title.toLowerCase()} `;
  for (const [fn, keywords] of TABLE) {
    for (const keyword of keywords) {
      if (haystack.includes(keyword)) return fn;
    }
  }
  return null;
}
