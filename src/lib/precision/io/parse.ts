import { Decimal } from "../primitives/core";

function stripAmount(raw: string): string {
  return raw.replace(/[\s$,]/g, "");
}

function parseAmount(input: string): string | null {
  const stripped = stripAmount(input);
  if (stripped === "") return null;

  let d: Decimal;
  try {
    d = new Decimal(stripped);
  } catch {
    return null;
  }

  if (d.isNeg()) return null;
  return d.toString();
}

function parsePrice(input: string): string | null {
  const stripped = input.replace(/[\s$,%]/g, "");
  if (stripped === "") return null;

  let d: Decimal;
  try {
    d = new Decimal(stripped);
  } catch {
    return null;
  }

  if (d.isNeg()) return null;
  if (d.gt(1)) return null;
  return d.toString();
}

function parseCents(input: string): number | null {
  const stripped = input.replace(/[\s\u00A2]/g, "");
  if (stripped === "") return null;

  let d: Decimal;
  try {
    d = new Decimal(stripped);
  } catch {
    return null;
  }

  if (!d.isInteger()) return null;
  const value = d.toNumber();
  if (value < 0 || value > 100) return null;
  return value;
}

function parseShares(input: string): string | null {
  const stripped = input.replace(/[\s,]/g, "");
  if (stripped === "") return null;

  let d: Decimal;
  try {
    d = new Decimal(stripped);
  } catch {
    return null;
  }

  if (d.isNeg()) return null;
  return d.toString();
}

export { parseAmount, parsePrice, parseCents, parseShares };
