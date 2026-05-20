// ---------------------------------------------------------------------------
// Self-contained arbitrary-precision decimal arithmetic.
//
// Backs the precision lib's Decimal class. Mirrors decimal.js behavior for
// the subset of operations used by this SDK. No runtime dependencies.
//
// Internal representation:
//   value = (-1)^neg * mantissa * 10^exp
//
//   mantissa: bigint, always >= 0n (zero only for the value 0)
//   exp:      integer
//   neg:      boolean (always false when mantissa is 0n)
//
// Normalization invariants:
//   - Zero is canonical: { neg: false, mantissa: 0n, exp: 0 }
//   - Non-zero mantissa has no trailing zero digits - trailing zeros are
//     hoisted into exp. So "100" is { mantissa: 1n, exp: 2 }, not 100/exp:0.
//
// Working precision: PRECISION (default 28). Division and any operation
// whose exact result exceeds PRECISION significant digits is rounded
// HALF_UP to PRECISION sig figs, matching decimal.js's default config.
// + - * are exact when their exact result fits in PRECISION sig figs.
// ---------------------------------------------------------------------------

const PRECISION = 28;
// Match decimal.js defaults: values whose decimal exponent is <= TO_EXP_NEG
// or >= TO_EXP_POS render in exponential notation.
const TO_EXP_NEG = -7;
const TO_EXP_POS = 21;

export type RoundingMode = 0 | 1 | 4;
export const ROUND_UP: RoundingMode = 0;
export const ROUND_DOWN: RoundingMode = 1;
export const ROUND_HALF_UP: RoundingMode = 4;

// ---------------------------------------------------------------------------
// pow10 cache - 10n ** BigInt(n) is hot
// ---------------------------------------------------------------------------

const POW10_CACHE: bigint[] = [1n];
function pow10(n: number): bigint {
  if (n < 0) throw new Error(`pow10: negative n (${n})`);
  if (n < POW10_CACHE.length) return POW10_CACHE[n]!;
  let last = POW10_CACHE[POW10_CACHE.length - 1]!;
  for (let i = POW10_CACHE.length; i <= n; i++) {
    last = last * 10n;
    POW10_CACHE.push(last);
  }
  return POW10_CACHE[n]!;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function digitCount(n: bigint): number {
  // n must be non-negative
  if (n === 0n) return 0;
  // toString allocates but is by far the simplest correct approach for
  // arbitrary-magnitude bigints. Faster alternatives (binary log + correction)
  // exist but aren't needed here.
  return n.toString().length;
}

function trimTrailingZeros(m: bigint, e: number): { m: bigint; e: number } {
  if (m === 0n) return { m: 0n, e: 0 };
  let mantissa = m;
  let exp = e;
  // Strip trailing zeros via repeated /10n. Bounded by digit count.
  while (mantissa % 10n === 0n) {
    mantissa /= 10n;
    exp += 1;
  }
  return { m: mantissa, e: exp };
}

// Parse "[+-]? (digits[.digits]? | .digits) ([eE][+-]?digits)?"
function parseString(input: string): {
  neg: boolean;
  mantissa: bigint;
  exp: number;
} {
  const s = input.trim();
  if (s === "") throw new Error("Invalid decimal: empty string");
  const m = s.match(
    /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/,
  );
  if (!m) throw new Error(`Invalid decimal: "${input}"`);
  const sign = m[1];
  const intPart = m[2] ?? "";
  const fracPart = m[3] ?? m[4] ?? "";
  const expPart = m[5] ?? "0";

  let digits = intPart + fracPart;
  // Strip leading zeros
  digits = digits.replace(/^0+/, "");
  let exp = parseInt(expPart, 10) - fracPart.length;

  if (digits === "") {
    // Preserve the sign for "-0" / "-0.0" inputs to match decimal.js, which
    // distinguishes -0 from +0 for predicates like isNegative(). Arithmetic
    // results that hit zero still canonicalize to +0 - only the constructor
    // path retains an explicit negative-zero.
    return { neg: sign === "-", mantissa: 0n, exp: 0 };
  }

  const mantissa0 = BigInt(digits);
  const trimmed = trimTrailingZeros(mantissa0, exp);
  return {
    neg: sign === "-",
    mantissa: trimmed.m,
    exp: trimmed.e,
  };
}

function fromParts(neg: boolean, mantissa: bigint, exp: number): Decimal {
  const t = trimTrailingZeros(mantissa, exp);
  // canonicalize zero
  const sign = t.m === 0n ? false : neg;
  // We bypass the public string constructor for performance & to avoid
  // re-parsing. Construct via the internal sentinel.
  return new Decimal(_INTERNAL, sign, t.m, t.e);
}

const _INTERNAL = Symbol("DecimalInternal");

// ---------------------------------------------------------------------------
// Compare absolute magnitudes
// ---------------------------------------------------------------------------

// Returns -1 / 0 / 1 for |a| vs |b|. Both must be non-zero or this still works.
function cmpAbs(a: Decimal, b: Decimal): -1 | 0 | 1 {
  if (a.mantissa === 0n && b.mantissa === 0n) return 0;
  if (a.mantissa === 0n) return -1;
  if (b.mantissa === 0n) return 1;
  // Compare by decimal exponent of value: floor(log10(|x|)) = digits(m) - 1 + exp
  const ea = digitCount(a.mantissa) - 1 + a.exp;
  const eb = digitCount(b.mantissa) - 1 + b.exp;
  if (ea !== eb) return ea < eb ? -1 : 1;
  // Same magnitude - align exps and compare mantissas
  if (a.exp === b.exp) {
    return a.mantissa === b.mantissa ? 0 : a.mantissa < b.mantissa ? -1 : 1;
  }
  if (a.exp > b.exp) {
    const aScaled = a.mantissa * pow10(a.exp - b.exp);
    return aScaled === b.mantissa ? 0 : aScaled < b.mantissa ? -1 : 1;
  }
  const bScaled = b.mantissa * pow10(b.exp - a.exp);
  return a.mantissa === bScaled ? 0 : a.mantissa < bScaled ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Round a (mantissa, exp) value to `sigFigs` significant digits HALF_UP.
// Used for division and to enforce PRECISION on operations whose exact
// result would exceed it. Sign is handled outside.
// ---------------------------------------------------------------------------

function roundToSigFigs(
  mantissa: bigint,
  exp: number,
  sigFigs: number,
  hasMoreNonZeroBeyond: boolean = false,
): { m: bigint; e: number } {
  if (mantissa === 0n) return { m: 0n, e: 0 };
  const d = digitCount(mantissa);
  if (d <= sigFigs) return trimTrailingZeros(mantissa, exp);
  const trim = d - sigFigs;
  const divisor = pow10(trim);
  const trunc = mantissa / divisor;
  const rem = mantissa % divisor;
  const half = pow10(trim - 1) * 5n;
  let rounded: bigint;
  if (rem > half || (rem === half && hasMoreNonZeroBeyond)) {
    rounded = trunc + 1n;
  } else if (rem < half) {
    rounded = trunc;
  } else {
    // exact half - HALF_UP rounds away from zero (we hold absolute value here)
    rounded = trunc + 1n;
  }
  // After rounding, mantissa may overflow into one more digit (e.g. 999...→1000).
  // trimTrailingZeros handles trailing zeros from this overflow correctly.
  return trimTrailingZeros(rounded, exp + trim);
}

// ---------------------------------------------------------------------------
// Decimal class
// ---------------------------------------------------------------------------

export type DecimalLike = string | number | Decimal;

export class Decimal {
  static readonly ROUND_UP = ROUND_UP;
  static readonly ROUND_DOWN = ROUND_DOWN;
  static readonly ROUND_HALF_UP = ROUND_HALF_UP;

  readonly neg: boolean;
  readonly mantissa: bigint;
  readonly exp: number;

  constructor(input: DecimalLike);
  constructor(
    token: typeof _INTERNAL,
    neg: boolean,
    mantissa: bigint,
    exp: number,
  );
  constructor(
    a: DecimalLike | typeof _INTERNAL,
    b?: boolean,
    c?: bigint,
    d?: number,
  ) {
    if (a === _INTERNAL) {
      this.neg = b!;
      this.mantissa = c!;
      this.exp = d!;
      return;
    }
    if (a instanceof Decimal) {
      this.neg = a.neg;
      this.mantissa = a.mantissa;
      this.exp = a.exp;
      return;
    }
    let s: string;
    if (typeof a === "number") {
      if (!Number.isFinite(a)) throw new Error(`Invalid number: ${a}`);
      // String(n) handles scientific notation produced by the JS runtime.
      s = String(a);
    } else if (typeof a === "string") {
      s = a;
    } else {
      throw new Error(`Unsupported input type: ${typeof a}`);
    }
    const parsed = parseString(s);
    // Construction is exact - decimal.js does not round inputs at construction
    // time, only on operations. We match that behavior so that constructor
    // round-trips through `toString` preserve all significant digits.
    this.neg = parsed.neg;
    this.mantissa = parsed.mantissa;
    this.exp = parsed.exp;
  }

  // -- predicates -----------------------------------------------------------

  isZero(): boolean {
    return this.mantissa === 0n;
  }
  isNegative(): boolean {
    return this.neg;
  }
  isNeg(): boolean {
    return this.neg;
  }
  isPositive(): boolean {
    // Match decimal.js: returns true for zero too. Code that wants
    // "strictly positive" must combine with `!isZero()`.
    return !this.neg;
  }
  isPos(): boolean {
    return this.isPositive();
  }
  isInteger(): boolean {
    if (this.mantissa === 0n) return true;
    return this.exp >= 0;
  }

  // -- comparisons ----------------------------------------------------------

  comparedTo(other: DecimalLike): -1 | 0 | 1 {
    const b = toDec(other);
    if (this.mantissa === 0n && b.mantissa === 0n) return 0;
    if (this.neg && !b.neg) return -1;
    if (!this.neg && b.neg) return 1;
    // same sign (or one of them is zero with neg=false)
    if (this.mantissa === 0n) return b.neg ? 1 : -1;
    if (b.mantissa === 0n) return this.neg ? -1 : 1;
    const c = cmpAbs(this, b);
    return this.neg ? (-c as -1 | 0 | 1) : c;
  }
  cmp(other: DecimalLike): -1 | 0 | 1 {
    return this.comparedTo(other);
  }
  equals(other: DecimalLike): boolean {
    return this.comparedTo(other) === 0;
  }
  eq(other: DecimalLike): boolean {
    return this.equals(other);
  }
  greaterThan(other: DecimalLike): boolean {
    return this.comparedTo(other) > 0;
  }
  gt(other: DecimalLike): boolean {
    return this.greaterThan(other);
  }
  greaterThanOrEqualTo(other: DecimalLike): boolean {
    return this.comparedTo(other) >= 0;
  }
  gte(other: DecimalLike): boolean {
    return this.greaterThanOrEqualTo(other);
  }
  lessThan(other: DecimalLike): boolean {
    return this.comparedTo(other) < 0;
  }
  lt(other: DecimalLike): boolean {
    return this.lessThan(other);
  }
  lessThanOrEqualTo(other: DecimalLike): boolean {
    return this.comparedTo(other) <= 0;
  }
  lte(other: DecimalLike): boolean {
    return this.lessThanOrEqualTo(other);
  }

  // -- unary ----------------------------------------------------------------

  abs(): Decimal {
    if (!this.neg) return this;
    return fromParts(false, this.mantissa, this.exp);
  }
  negated(): Decimal {
    if (this.mantissa === 0n) return this;
    return fromParts(!this.neg, this.mantissa, this.exp);
  }
  neg_(): Decimal {
    return this.negated();
  }

  // -- arithmetic -----------------------------------------------------------

  plus(other: DecimalLike): Decimal {
    const b = toDec(other);

    // Even when one operand is zero, decimal.js applies precision rounding
    // to the result. So `Decimal("1.234...long").plus(0)` returns the value
    // rounded to PRECISION sig figs, not the original.
    if (this.mantissa === 0n) {
      const r = roundToSigFigs(b.mantissa, b.exp, PRECISION);
      return fromParts(r.m === 0n ? false : b.neg, r.m, r.e);
    }
    if (b.mantissa === 0n) {
      const r = roundToSigFigs(this.mantissa, this.exp, PRECISION);
      return fromParts(r.m === 0n ? false : this.neg, r.m, r.e);
    }

    // Align exps so we can add mantissas as bigints.
    const minExp = Math.min(this.exp, b.exp);
    const aM = this.mantissa * pow10(this.exp - minExp);
    const bM = b.mantissa * pow10(b.exp - minExp);

    let resNeg: boolean;
    let resM: bigint;
    if (this.neg === b.neg) {
      resNeg = this.neg;
      resM = aM + bM;
    } else if (aM === bM) {
      return ZERO;
    } else if (aM > bM) {
      resNeg = this.neg;
      resM = aM - bM;
    } else {
      resNeg = b.neg;
      resM = bM - aM;
    }

    const rounded = roundToSigFigs(resM, minExp, PRECISION);
    return fromParts(resNeg, rounded.m, rounded.e);
  }

  minus(other: DecimalLike): Decimal {
    const b = toDec(other);
    return this.plus(fromParts(!b.neg, b.mantissa, b.exp));
  }

  times(other: DecimalLike): Decimal {
    const b = toDec(other);
    if (this.mantissa === 0n || b.mantissa === 0n) return ZERO;
    const m = this.mantissa * b.mantissa;
    const e = this.exp + b.exp;
    const sign = this.neg !== b.neg;
    const rounded = roundToSigFigs(m, e, PRECISION);
    return fromParts(sign, rounded.m, rounded.e);
  }

  dividedBy(other: DecimalLike): Decimal {
    const b = toDec(other);
    if (b.mantissa === 0n) throw new Error("Division by zero");
    if (this.mantissa === 0n) return ZERO;
    const sign = this.neg !== b.neg;

    // Strategy: compute scaledNum / b.mantissa with enough digits that
    // the quotient has at least PRECISION+1 significant digits, then round
    // to PRECISION HALF_UP. Use the remainder for tie-breaking.
    const aDigits = digitCount(this.mantissa);
    const bDigits = digitCount(b.mantissa);
    // Quotient's leading-digit position before any scaling: roughly
    // aDigits - bDigits + (a.m >= b.m ? 1 : 0). We want PRECISION+2 digits,
    // so scale numerator up by enough.
    const wantDigits = PRECISION + 2;
    const haveDigits =
      aDigits - bDigits + (this.mantissa >= b.mantissa ? 1 : 0);
    const shift = Math.max(0, wantDigits - haveDigits);

    const scaledNum = this.mantissa * pow10(shift);
    const q = scaledNum / b.mantissa;
    const rem = scaledNum % b.mantissa;
    const newExp = this.exp - b.exp - shift;

    const rounded = roundToSigFigs(q, newExp, PRECISION, rem !== 0n);
    return fromParts(sign, rounded.m, rounded.e);
  }
  div(other: DecimalLike): Decimal {
    return this.dividedBy(other);
  }

  // Integer-exponent power. Throws on non-integer exponent.
  pow(exponent: DecimalLike): Decimal {
    const e = toDec(exponent);
    if (!e.isInteger()) {
      throw new Error("pow: only integer exponents are supported");
    }
    // Convert exponent to a JS number; mantissa fits if |exp value| < 2^53,
    // which is comfortably more than any real-world need.
    let n: number;
    if (e.mantissa === 0n) {
      return ONE;
    }
    if (e.exp === 0) {
      if (e.mantissa > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("pow: exponent too large");
      }
      n = Number(e.mantissa) * (e.neg ? -1 : 1);
    } else {
      // exp >= 0 and mantissa has trailing zeros stripped - combine
      const full = e.mantissa * pow10(e.exp);
      if (full > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("pow: exponent too large");
      }
      n = Number(full) * (e.neg ? -1 : 1);
    }
    if (n === 0) return ONE;
    if (this.mantissa === 0n) {
      if (n < 0)
        throw new Error("pow: 0 cannot be raised to a negative exponent");
      return ZERO;
    }

    const negResult = this.neg && n % 2 !== 0;
    const absExp = Math.abs(n);
    // Square-and-multiply on the absolute mantissa
    let baseM = this.mantissa;
    let baseE = this.exp;
    let resM = 1n;
    let resE = 0;
    let k = absExp;
    while (k > 0) {
      if (k & 1) {
        resM = resM * baseM;
        resE = resE + baseE;
        const r = roundToSigFigs(resM, resE, PRECISION);
        resM = r.m;
        resE = r.e;
      }
      k >>>= 1;
      if (k > 0) {
        baseM = baseM * baseM;
        baseE = baseE + baseE;
        const r = roundToSigFigs(baseM, baseE, PRECISION);
        baseM = r.m;
        baseE = r.e;
      }
    }
    if (n < 0) {
      // Reciprocal: 1 / result
      return fromParts(negResult, 1n, 0).dividedBy(
        fromParts(false, resM, resE),
      );
    }
    return fromParts(negResult, resM, resE);
  }

  // -- rounding to integer using global mode (HALF_UP) ----------------------

  round(): Decimal {
    return roundDp(this, 0, ROUND_HALF_UP);
  }
  floor(): Decimal {
    return roundDp(this, 0, ROUND_FLOOR_INTERNAL);
  }
  ceil(): Decimal {
    return roundDp(this, 0, ROUND_CEIL_INTERNAL);
  }

  // -- toFixed --------------------------------------------------------------

  toFixed(dp?: number, mode: RoundingMode = ROUND_HALF_UP): string {
    if (dp === undefined) {
      // Match decimal.js: toFixed() with no arg returns the canonical string
      // (no fixed dp, no exponential).
      return this.toFixedFlat();
    }
    if (!Number.isInteger(dp) || dp < 0) {
      throw new RangeError(
        `toFixed: dp must be a non-negative integer (got ${dp})`,
      );
    }
    if (this.mantissa === 0n) {
      return dp === 0 ? "0" : "0." + "0".repeat(dp);
    }

    // Round absolute mantissa at 10^-dp granularity. Sign stays separate
    // so we can preserve "-0" output (matches decimal.js for both DOWN
    // truncation and HALF_UP rounding of tiny negatives).
    const targetExp = -dp;
    let m: bigint;
    if (this.exp >= targetExp) {
      m = this.mantissa * pow10(this.exp - targetExp);
    } else {
      const trim = targetExp - this.exp;
      const divisor = pow10(trim);
      const trunc = this.mantissa / divisor;
      const rem = this.mantissa % divisor;
      const half = pow10(trim - 1) * 5n;
      switch (mode) {
        case ROUND_DOWN:
          m = trunc;
          break;
        case ROUND_UP:
          m = rem === 0n ? trunc : trunc + 1n;
          break;
        case ROUND_HALF_UP:
          if (rem > half) m = trunc + 1n;
          else if (rem < half) m = trunc;
          else m = trunc + 1n; // tie → away from zero
          break;
        default:
          throw new Error(`toFixed: unsupported rounding mode (${mode})`);
      }
    }

    const sign = this.neg ? "-" : "";
    const s = m.toString();
    if (dp === 0) return sign + s;
    if (s.length <= dp) {
      return sign + "0." + "0".repeat(dp - s.length) + s;
    }
    return sign + s.slice(0, s.length - dp) + "." + s.slice(s.length - dp);
  }

  // toString without exponential notation, full precision (matches decimal.js
  // toFixed() with no args for the values produced in this codebase).
  private toFixedFlat(): string {
    if (this.mantissa === 0n) return "0";
    return formatPlain(this);
  }

  // -- toString -------------------------------------------------------------

  toString(): string {
    if (this.mantissa === 0n) return "0";
    // Decimal exponent of the value: floor(log10(|value|))
    const valExp = digitCount(this.mantissa) - 1 + this.exp;
    if (valExp <= TO_EXP_NEG || valExp >= TO_EXP_POS) {
      return formatExponential(this, valExp);
    }
    return formatPlain(this);
  }
  valueOf(): string {
    return this.toString();
  }

  // -- toNumber -------------------------------------------------------------

  toNumber(): number {
    if (this.mantissa === 0n) return 0;
    // Use parseFloat on toString - handles huge & tiny via exponential.
    return parseFloat(this.toString());
  }

  // -- floor of log10(|this|) - used internally; not on decimal.js's API ----
  //
  // Returns floor(log10(|value|)) as a Decimal integer. Throws on zero.
  // Equivalent to (digitCount(mantissa) - 1 + exp).
  floorLog10(): Decimal {
    if (this.mantissa === 0n) {
      throw new RangeError("floorLog10: log of zero is undefined");
    }
    const v = digitCount(this.mantissa) - 1 + this.exp;
    return fromInt(v);
  }

  // -- significant digits ---------------------------------------------------

  toSignificantDigits(sigFigs: number): Decimal {
    if (!Number.isInteger(sigFigs) || sigFigs < 1) {
      throw new RangeError(
        `toSignificantDigits: sigFigs must be >= 1 (got ${sigFigs})`,
      );
    }
    if (this.mantissa === 0n) return this;
    const r = roundToSigFigs(this.mantissa, this.exp, sigFigs);
    return fromParts(this.neg, r.m, r.e);
  }

  // -- statics --------------------------------------------------------------

  static min(...values: DecimalLike[]): Decimal {
    if (values.length === 0)
      throw new Error("min: at least one argument required");
    let best = toDec(values[0]!);
    for (let i = 1; i < values.length; i++) {
      const v = toDec(values[i]!);
      if (v.lt(best)) best = v;
    }
    return best;
  }
  static max(...values: DecimalLike[]): Decimal {
    if (values.length === 0)
      throw new Error("max: at least one argument required");
    let best = toDec(values[0]!);
    for (let i = 1; i < values.length; i++) {
      const v = toDec(values[i]!);
      if (v.gt(best)) best = v;
    }
    return best;
  }
  static sum(...values: DecimalLike[]): Decimal {
    let acc = ZERO;
    for (const v of values) acc = acc.plus(toDec(v));
    return acc;
  }
}

// ---------------------------------------------------------------------------
// Internal rounding helpers
// ---------------------------------------------------------------------------

const ROUND_FLOOR_INTERNAL = 100 as const;
const ROUND_CEIL_INTERNAL = 101 as const;

type InternalMode =
  | RoundingMode
  | typeof ROUND_FLOOR_INTERNAL
  | typeof ROUND_CEIL_INTERNAL;

// Round a Decimal to `dp` decimal places. Returns a new Decimal whose exp
// is normalized (trailing zeros stripped), so the value is the rounded
// magnitude - but `formatFixed` re-pads to dp for display.
function roundDp(d: Decimal, dp: number, mode: InternalMode): Decimal {
  if (d.mantissa === 0n) return ZERO;
  const targetExp = -dp;
  if (d.exp >= targetExp) {
    // No rounding needed; value already lands on a multiple of 10^-dp.
    return d;
  }
  // exp < targetExp: trim (targetExp - exp) lowest digits.
  const trim = targetExp - d.exp;
  const divisor = pow10(trim);
  const trunc = d.mantissa / divisor;
  const rem = d.mantissa % divisor;
  const half = pow10(trim - 1) * 5n;

  let rounded: bigint;
  switch (mode) {
    case ROUND_DOWN:
      // Toward zero - abs truncates regardless of sign.
      rounded = trunc;
      break;
    case ROUND_UP:
      // Away from zero.
      rounded = rem === 0n ? trunc : trunc + 1n;
      break;
    case ROUND_HALF_UP:
      if (rem > half) rounded = trunc + 1n;
      else if (rem < half) rounded = trunc;
      else rounded = trunc + 1n; // tie → away from zero
      break;
    case ROUND_FLOOR_INTERNAL:
      // Toward -Infinity.
      if (d.neg) rounded = rem === 0n ? trunc : trunc + 1n;
      else rounded = trunc;
      break;
    case ROUND_CEIL_INTERNAL:
      // Toward +Infinity.
      if (d.neg) rounded = trunc;
      else rounded = rem === 0n ? trunc : trunc + 1n;
      break;
    default:
      throw new Error(`Unsupported rounding mode: ${mode}`);
  }

  if (rounded === 0n) return ZERO;
  return fromParts(d.neg, rounded, targetExp);
}

// ---------------------------------------------------------------------------
// String formatting
// ---------------------------------------------------------------------------

// Plain decimal notation, no exponent. Includes leading "-".
function formatPlain(d: Decimal): string {
  if (d.mantissa === 0n) return "0";
  const digits = d.mantissa.toString();
  const sign = d.neg ? "-" : "";
  if (d.exp >= 0) {
    // Integer with possible trailing zeros
    return sign + digits + "0".repeat(d.exp);
  }
  const fracLen = -d.exp;
  if (fracLen >= digits.length) {
    return sign + "0." + "0".repeat(fracLen - digits.length) + digits;
  }
  const intPart = digits.slice(0, digits.length - fracLen);
  const fracPart = digits.slice(digits.length - fracLen);
  return sign + intPart + "." + fracPart;
}

// "1.5e+25" style. valExp = floor(log10(|value|)).
function formatExponential(d: Decimal, valExp: number): string {
  const digits = d.mantissa.toString();
  const sign = d.neg ? "-" : "";
  const head = digits[0]!;
  const tail = digits.slice(1);
  const mant = tail.length === 0 ? head : `${head}.${tail}`;
  const expPart = valExp >= 0 ? `e+${valExp}` : `e${valExp}`;
  return sign + mant + expPart;
}

// "x.yyyy" with exactly `dp` decimals. d's value must be exactly representable
// at 10^-dp granularity (i.e., this is called only after roundDp).
function formatFixed(d: Decimal, dp: number): string {
  if (d.mantissa === 0n) {
    return dp === 0 ? "0" : "0." + "0".repeat(dp);
  }
  const sign = d.neg ? "-" : "";
  // Convert d to the form mantissa' * 10^-dp by scaling mantissa up.
  let m: bigint;
  if (d.exp >= -dp) {
    m = d.mantissa * pow10(d.exp + dp);
  } else {
    // shouldn't happen post-roundDp, but guard anyway by truncating
    m = d.mantissa / pow10(-dp - d.exp);
  }
  const s = m.toString();
  if (dp === 0) return sign + s;
  if (s.length <= dp) {
    return sign + "0." + "0".repeat(dp - s.length) + s;
  }
  const intPart = s.slice(0, s.length - dp);
  const fracPart = s.slice(s.length - dp);
  return sign + intPart + "." + fracPart;
}

// ---------------------------------------------------------------------------
// Coercion + constants
// ---------------------------------------------------------------------------

function toDec(x: DecimalLike): Decimal {
  return x instanceof Decimal ? x : new Decimal(x);
}

function fromInt(n: number): Decimal {
  if (!Number.isInteger(n)) throw new Error("fromInt: not an integer");
  if (n === 0) return ZERO;
  const neg = n < 0;
  const abs = Math.abs(n);
  return fromParts(neg, BigInt(abs), 0);
}

const ZERO = new Decimal(_INTERNAL, false, 0n, 0);
const ONE = new Decimal(_INTERNAL, false, 1n, 0);
