// ---------------------------------------------------------------------------
// The outcomeTemplates registry
//
// @experimental A template is a market shape with `{keyword}` placeholders in
// its name, description and side names. Deploying one means supplying a value
// for every keyword it declares. Everything here is pure: pass in the registry
// as fetched.
// ---------------------------------------------------------------------------

import type {
  HLKeywordHint,
  HLOutcomeTemplate,
  HLTemplateRole,
  HLTemplateRoleKind,
} from "../adapter/hyperliquid/types";
import { DeployerError } from "./error";

/** Every hint the registry currently publishes. */
export const KEYWORD_HINTS: readonly HLKeywordHint[] = [
  "date",
  "dateTime",
  "hlPerp",
  "shortString",
  "string",
  "uDecimal",
  "uInt",
] as const;

/** Which of the three roles a template plays. */
export function templateRoleKind(role: HLTemplateRole): HLTemplateRoleKind {
  if (typeof role === "string") {
    return role === "question" || role === "questionOutcome"
      ? role
      : "standaloneOutcome";
  }
  if (role.questionOutcome) return "questionOutcome";
  if (role.question) return "question";
  return "standaloneOutcome";
}

/** The question template a named outcome deploys under, or null. */
export function templateParentId(role: HLTemplateRole): string | null {
  if (typeof role === "string") return null;
  const parent = role.questionOutcome?.parent;
  return typeof parent === "string" ? parent : null;
}

/**
 * The two side names a standalone template deploys with. They can carry
 * placeholders of their own, so they are returned as published: for example
 * `sportsContestWinner3` settles to `{shortNameA}` and `{shortNameB}`.
 */
export function templateSideNames(role: HLTemplateRole): [string, string] {
  const sides =
    typeof role === "string" ? undefined : role.standaloneOutcome?.sideNames;
  if (Array.isArray(sides) && sides.length === 2) {
    return [String(sides[0]), String(sides[1])];
  }
  return ["Yes", "No"];
}

/** Look one up by id. */
export function findTemplate(
  templates: readonly HLOutcomeTemplate[],
  id: string,
): HLOutcomeTemplate | null {
  return templates.find((t) => t.id === id) ?? null;
}

/** Look one up by id, or say what is available. */
export function requireTemplate(
  templates: readonly HLOutcomeTemplate[],
  id: string,
): HLOutcomeTemplate {
  const found = findTemplate(templates, id);
  if (found) return found;
  throw new DeployerError(
    `Template "${id}" is not in the live registry. Available: ${templates
      .map((t) => t.id)
      .join(", ")}`,
  );
}

/** The named outcome templates that belong to a question template. */
export function namedOutcomeTemplates(
  templates: readonly HLOutcomeTemplate[],
  questionTemplateId: string,
): HLOutcomeTemplate[] {
  return templates.filter(
    (t) => templateParentId(t.role) === questionTemplateId,
  );
}

// -- Stamps -----------------------------------------------------------------

const STAMP_RE = /^(\d{4})(\d{2})(\d{2})(?:-(\d{2})(\d{2}))?$/;

/**
 * Parse a `YYYYMMDD` or `YYYYMMDD-HHMM` UTC stamp, or null.
 *
 * Out-of-range parts are refused rather than rolled over: `Date.UTC` would
 * silently turn month 13 into the following January, which would let an
 * unintended expiry through.
 */
export function parseTemplateStamp(stamp: string): Date | null {
  const m = STAMP_RE.exec(stamp);
  if (!m) return null;
  const [year, month, day, hour, minute] = [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4] ?? "0"),
    Number(m[5] ?? "0"),
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (Number.isNaN(date.getTime())) return null;
  /* Catches a day that does not exist in that month, e.g. 20260231. */
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

/** Format a UTC stamp for a `date` or `dateTime` keyword. */
export function toTemplateStamp(
  date: Date,
  hint: "date" | "dateTime" = "dateTime",
): string {
  const p = (n: number, width = 2) => String(n).padStart(width, "0");
  const day = `${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}`;
  return hint === "date"
    ? day
    : `${day}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}`;
}

// -- Keyword values ---------------------------------------------------------

/** How far ahead a dated keyword may point. */
export const MAX_KEYWORD_HORIZON_MS = 366 * 24 * 60 * 60 * 1000;

export interface ValidateKeywordOptions {
  /** Perp names from `meta.universe`, to check an `hlPerp` value against. */
  knownPerps?: ReadonlySet<string>;
  /** Clock, for the dated hints. Defaults to now. */
  now?: number;
  /** Allow a dated keyword in the past, e.g. when re-reading a settled market. */
  allowPastDates?: boolean;
}

/**
 * The problem with one keyword value, or null when there is none.
 *
 * The numeric grammars are exact rather than lenient: the exchange refuses a
 * sign, an exponent, or a leading or trailing zero, and refusing it here costs
 * a correction while refusing it there costs one of the day's deploys.
 */
export function validateKeywordValue(
  /** Named for call-site clarity; the grammar depends only on the hint. */
  keyword: string,
  hint: string,
  value: string,
  options: ValidateKeywordOptions = {},
): string | null {
  if (!value) return "Required";
  if (value.length > 100) return "Max 100 characters";
  if (/[{}|]/.test(value)) return "Must not contain { } |";

  if (hint === "date" || hint === "dateTime") {
    const expected = hint === "date" ? "YYYYMMDD" : "YYYYMMDD-HHMM";
    const parsed = parseTemplateStamp(value);
    if (!parsed) return `Use ${expected} (UTC)`;
    if (value.includes("-") !== (hint === "dateTime")) {
      return `Use ${expected} (UTC)`;
    }
    const now = options.now ?? Date.now();
    if (!options.allowPastDates && parsed.getTime() <= now) {
      return "Must be in the future";
    }
    if (parsed.getTime() > now + MAX_KEYWORD_HORIZON_MS) {
      return "Must be within one year";
    }
  }
  if (hint === "uInt" && !/^(0|[1-9]\d*)$/.test(value)) {
    return "Whole number, no sign or leading zeros";
  }
  if (hint === "uDecimal" && !/^(0|[1-9]\d*)(\.\d*[1-9])?$/.test(value)) {
    return "Decimal, no sign, exponent, or trailing zeros";
  }
  if (hint === "shortString" && value.length > 10) {
    return "Max 10 characters";
  }
  if (
    hint === "hlPerp" &&
    options.knownPerps !== undefined &&
    !options.knownPerps.has(value)
  ) {
    return `Unknown Hyperliquid perp "${value}"`;
  }
  return null;
}

/** One thing wrong with a proposed instantiation. */
export interface TemplateProblem {
  keyword: string;
  problem: string;
}

/**
 * Everything wrong with a proposed instantiation: missing keywords, keywords
 * the template does not declare, and values that fail their hint.
 */
export function validateTemplateInstance(
  template: HLOutcomeTemplate,
  values: Record<string, string>,
  options: ValidateKeywordOptions = {},
): TemplateProblem[] {
  const declared = new Map(template.keywords.map(([k, hint]) => [k, hint]));
  const problems: TemplateProblem[] = [];

  for (const keyword of declared.keys()) {
    if (!(keyword in values)) {
      problems.push({ keyword, problem: "Required" });
    }
  }
  for (const keyword of Object.keys(values)) {
    if (!declared.has(keyword)) {
      problems.push({
        keyword,
        problem: `Not a keyword of template "${template.id}"`,
      });
      continue;
    }
    const problem = validateKeywordValue(
      keyword,
      declared.get(keyword) as string,
      values[keyword] as string,
      options,
    );
    if (problem !== null) problems.push({ keyword, problem });
  }
  return problems;
}

/** Validate, and throw with every problem listed at once. */
export function assertTemplateInstance(
  template: HLOutcomeTemplate,
  values: Record<string, string>,
  options: ValidateKeywordOptions = {},
): void {
  const problems = validateTemplateInstance(template, values, options);
  if (problems.length === 0) return;
  throw new DeployerError(
    `Cannot instantiate "${template.id}": ${problems
      .map((p) => `${p.keyword}: ${p.problem}`)
      .join("; ")}`,
  );
}

// -- Rendering --------------------------------------------------------------

/** Substitute `{keyword}` placeholders, leaving unknown ones in place. */
export function renderTemplateText(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);
}

/** Every `{placeholder}` in a piece of template text. */
export function placeholdersIn(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    if (m[1] !== undefined) found.push(m[1]);
  }
  return found;
}

/**
 * Placeholders a template uses but never declares as a keyword, which is a
 * template that cannot be fully instantiated.
 */
export function unfillablePlaceholders(template: HLOutcomeTemplate): string[] {
  const declared = new Set(template.keywords.map(([k]) => k));
  const used = [
    ...placeholdersIn(template.name),
    ...placeholdersIn(template.description),
    ...templateSideNames(template.role).flatMap(placeholdersIn),
  ];
  return [...new Set(used.filter((k) => !declared.has(k)))];
}

/**
 * The description a template instance carries on chain: `keyword:value` pairs
 * sorted by keyword and pipe-joined. This is what a deployed outcome's
 * `description` holds, so it round-trips with `parseInstanceDescription`.
 */
export function instanceDescription(values: Record<string, string>): string {
  return Object.keys(values)
    .sort()
    .map((k) => `${k}:${values[k]}`)
    .join("|");
}

/** Recover the keyword values from a deployed outcome's description. */
export function parseInstanceDescription(
  description: string,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const part of description.split("|")) {
    const at = part.indexOf(":");
    if (at <= 0) continue;
    values[part.slice(0, at)] = part.slice(at + 1);
  }
  return values;
}

/** The template a deployed outcome came from, read off its name. */
export function templateIdOfOutcome(name: string): string | null {
  return name.startsWith("template:") ? name.slice("template:".length) : null;
}

// -- Versioning -------------------------------------------------------------

/**
 * Template ids carry a version as a trailing index: `binaryPrice`,
 * `binaryPrice2`, `binaryPrice4`. Highest index wins.
 */
export interface SeriesId {
  base: string;
  /** 1 when the id has no suffix, which is the first of a series. */
  index: number;
}

export function parseSeriesId(id: string): SeriesId {
  const m = /^(.*?)(\d+)$/.exec(id);
  if (!m?.[1]) return { base: id, index: 1 };
  return { base: m[1], index: Number(m[2]) };
}

export interface SeriesFacts {
  /** Ids superseded by a higher index in the same series. */
  deprecated: Set<string>;
  /** Base to the id that supersedes the rest of its series. */
  currentOf: Map<string, string>;
}

/**
 * Which ids a newer version has replaced. A lone id with a suffix is not
 * deprecated: with nothing to compare it to there is no successor to name.
 */
export function seriesFacts(ids: readonly string[]): SeriesFacts {
  const byBase = new Map<string, Array<{ id: string; index: number }>>();
  for (const id of ids) {
    const { base, index } = parseSeriesId(id);
    byBase.set(base, [...(byBase.get(base) ?? []), { id, index }]);
  }
  const deprecated = new Set<string>();
  const currentOf = new Map<string, string>();
  for (const [base, list] of byBase) {
    if (list.length < 2) continue;
    const top = list.reduce((a, b) => (b.index > a.index ? b : a));
    currentOf.set(base, top.id);
    for (const item of list) if (item.id !== top.id) deprecated.add(item.id);
  }
  return { deprecated, currentOf };
}

/** The id that replaced this one, or null when nothing has. */
export function supersededBy(
  id: string,
  ids: readonly string[],
): string | null {
  const facts = seriesFacts(ids);
  if (!facts.deprecated.has(id)) return null;
  return facts.currentOf.get(parseSeriesId(id).base) ?? null;
}

/** Split a registry into what to offer and what a newer version replaced. */
export function splitBySeries(
  templates: readonly HLOutcomeTemplate[],
): { current: HLOutcomeTemplate[]; deprecated: HLOutcomeTemplate[] } {
  const facts = seriesFacts(templates.map((t) => t.id));
  return {
    current: templates.filter((t) => !facts.deprecated.has(t.id)),
    deprecated: templates.filter((t) => facts.deprecated.has(t.id)),
  };
}
