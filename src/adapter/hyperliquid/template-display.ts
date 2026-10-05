// ---------------------------------------------------------------------------
// Readable names for template markets
//
// A market deployed from Hyperliquid's template registry carries only its
// template id and keyword values on the wire:
//
//   name:        "template:priceTouch"
//   description: "perp:BTC|target:90000|time:20261101-0000|..."
//   sideSpecs:   [{ name: "template:Yes" }, { name: "template:No" }]
//
// Filling the template's `{placeholder}` name with those values gives
// "BTC touches 90000 by Nov 1, 00:00 UTC".
// ---------------------------------------------------------------------------

import {
  findTemplate,
  parseInstanceDescription,
  parseTemplateStamp,
  templateIdOfOutcome,
} from "../../deployer/templates";
import type { HLOutcomeTemplate } from "./types";

/** Name of a template question's protocol-created fallback leg. */
export const FALLBACK_OUTCOME_NAME = "Other";

const TEMPLATE_PREFIX = "template:";
const PLACEHOLDER = /\{\w+\}/;

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatValue(hint: string | undefined, raw: string): string {
  const value = raw.trim();
  if (hint === "dateTime" || hint === "date") {
    const date = parseTemplateStamp(value);
    if (date) {
      return hint === "date" ? DATE.format(date) : `${DATE_TIME.format(date)} UTC`;
    }
  }
  return value;
}

/** Fill `{placeholders}`, or return null if a value is missing. */
function fill(
  text: string,
  values: Record<string, string>,
  hints: Map<string, string>,
): string | null {
  let missing = false;
  const out = text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined) {
      missing = true;
      return "";
    }
    return formatValue(hints.get(key), value);
  });
  return missing ? null : out;
}

/**
 * The keyword names a template declares for an outcome, or `undefined` when
 * the outcome is not a template instance or its template is not in
 * `templates`. Used to tell real keywords from a metadata tag's body.
 */
export function declaredKeywordsOf(
  outcomeName: string,
  templates: readonly HLOutcomeTemplate[],
): ReadonlySet<string> | undefined {
  const templateId = templateIdOfOutcome(outcomeName);
  const template = templateId ? findTemplate(templates, templateId) : null;
  return template ? new Set(template.keywords.map(([k]) => k)) : undefined;
}

/**
 * Render the name and side names of a template market. Anything that is not
 * a template instance, or whose template is not in `templates`, keeps its
 * wire names.
 */
export function renderTemplateDisplay(
  entity: {
    name: string;
    description: string;
    sideSpecs?: ReadonlyArray<{ name: string }>;
  },
  templates: readonly HLOutcomeTemplate[],
): { name: string; sideNames: [string, string] } {
  const templateId = templateIdOfOutcome(entity.name);
  const template = templateId ? findTemplate(templates, templateId) : null;
  const hints = new Map(template?.keywords ?? []);
  const values = parseInstanceDescription(
    entity.description,
    declaredKeywordsOf(entity.name, templates),
  );

  const side = (index: 0 | 1): string => {
    const raw = entity.sideSpecs?.[index]?.name ?? `Side ${index}`;
    if (!raw.startsWith(TEMPLATE_PREFIX)) return raw;
    const text = raw.slice(TEMPLATE_PREFIX.length);
    if (!template) {
      // Registry unavailable or template unknown: plain text such as
      // "template:Yes" still reads as "Yes"; placeholders stay as sent.
      return PLACEHOLDER.test(text) ? raw : text;
    }
    return fill(text, values, hints) ?? text;
  };

  return {
    name: (template && fill(template.name, values, hints)) ?? entity.name,
    sideNames: [side(0), side(1)],
  };
}

/**
 * Names for one outcome of a market list. The fallback leg of a template
 * question is named "Other"; everything else goes through
 * `renderTemplateDisplay`.
 */
export function renderOutcomeDisplay(
  outcome: {
    name: string;
    description: string;
    sideSpecs?: ReadonlyArray<{ name: string }>;
  },
  templates: readonly HLOutcomeTemplate[],
  isFallback = false,
): { name: string; sideNames: [string, string] } {
  const own = renderTemplateDisplay(outcome, templates);
  const isTemplateFallback =
    isFallback && outcome.name.startsWith(TEMPLATE_PREFIX);
  return {
    name: isTemplateFallback ? FALLBACK_OUTCOME_NAME : own.name,
    sideNames: own.sideNames,
  };
}
