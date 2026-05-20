// ---------------------------------------------------------------------------
// Parity tests for the inline Decimal implementation in
// src/lib/precision/primitives/_decimal-impl.ts. We compare every method's
// output to decimal.js (configured the same way the SDK uses it) across:
//   1. curated edge cases
//   2. random inputs from a deterministic seeded RNG (so failures are
//      reproducible from the seed printed in the failure message).
// ---------------------------------------------------------------------------

import DecimalJS from "decimal.js";
import { describe, expect, it } from "vitest";

import { Decimal as Dec } from "../../src/lib/precision/primitives/_decimal-impl";

const DJS = DecimalJS.clone({
  precision: 28,
  rounding: DecimalJS.ROUND_HALF_UP,
});

// Mulberry32 - small, deterministic, good enough for bias-free fuzzing.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate a random decimal string. Result has up to `maxDigits` significant
// digits and a decimal exponent in [-maxExp, maxExp].
function randDecimalStr(
  rand: () => number,
  maxDigits = 20,
  maxExp = 25,
): string {
  const sign = rand() < 0.5 ? "-" : "";
  const digitCount = 1 + Math.floor(rand() * maxDigits);
  let digits = "";
  // first digit non-zero
  digits += 1 + Math.floor(rand() * 9);
  for (let i = 1; i < digitCount; i++) {
    digits += Math.floor(rand() * 10);
  }
  const exp = Math.floor(rand() * (2 * maxExp + 1)) - maxExp;
  // 30% probability emit with explicit exponent, else as plain decimal
  if (rand() < 0.3) {
    return `${sign}${digits[0]}${digits.length > 1 ? "." + digits.slice(1) : ""}e${exp}`;
  }
  // Place decimal point so the value's effective exponent is `exp`
  // value = sign * digits * 10^(exp - (digitCount - 1))
  const e = exp - (digitCount - 1);
  if (e >= 0) {
    return sign + digits + "0".repeat(e);
  }
  const frac = -e;
  if (frac >= digits.length) {
    return sign + "0." + "0".repeat(frac - digits.length) + digits;
  }
  return (
    sign +
    digits.slice(0, digits.length - frac) +
    "." +
    digits.slice(digits.length - frac)
  );
}

// ---------------------------------------------------------------------------
// Edge case input bank
// ---------------------------------------------------------------------------

const EDGE_INPUTS: string[] = [
  "0",
  "-0",
  "0.0",
  "0.00000",
  "1",
  "-1",
  "10",
  "100",
  "1000",
  "0.1",
  "0.01",
  "0.001",
  "0.5",
  "-0.5",
  "1.5",
  "2.5",
  "-2.5",
  "3.14159265358979323846",
  "0.000000123",
  "1e-7",
  "9.999999999999e-8",
  "1.23456789012345678901234567890", // > 28 sig figs
  "100000000000000000000000", // 1e23, triggers exp notation in toString
  "1e+30",
  "1e-30",
  "0.00000000000000000001",
  ".5",
  "5.",
  "+1.5",
  "-1.5e+10",
  "-1.5e-10",
];

// ---------------------------------------------------------------------------
// 1. Construction & toString
// ---------------------------------------------------------------------------

describe("Decimal: parity - construction & toString", () => {
  for (const s of EDGE_INPUTS) {
    it(`${JSON.stringify(s)} round-trips identically`, () => {
      const a = new Dec(s).toString();
      const b = new DJS(s).toString();
      expect(a).toBe(b);
    });
  }

  it("random toString parity", () => {
    const rand = rng(12345);
    for (let i = 0; i < 2000; i++) {
      const s = randDecimalStr(rand);
      const a = new Dec(s).toString();
      const b = new DJS(s).toString();
      if (a !== b) {
        throw new Error(
          `toString diverged on input "${s}": ours=${a} djs=${b}`,
        );
      }
    }
  });

  it("number input parity", () => {
    const rand = rng(99999);
    for (let i = 0; i < 500; i++) {
      // sample some Number values from log-uniform distribution
      const sign = rand() < 0.5 ? -1 : 1;
      const exp = Math.floor(rand() * 30) - 15;
      const mant = rand() * 9 + 1;
      const n = sign * mant * Math.pow(10, exp);
      if (!Number.isFinite(n)) continue;
      const a = new Dec(n).toString();
      const b = new DJS(n).toString();
      expect(a).toBe(b);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Predicates
// ---------------------------------------------------------------------------

describe("Decimal: parity - predicates", () => {
  it("isZero / isNegative / isPositive / isInteger across edge inputs", () => {
    for (const s of EDGE_INPUTS) {
      const a = new Dec(s);
      const b = new DJS(s);
      expect(a.isZero()).toBe(b.isZero());
      expect(a.isNegative()).toBe(b.isNegative());
      expect(a.isPositive()).toBe(b.isPositive());
      expect(a.isInteger()).toBe(b.isInteger());
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Comparisons
// ---------------------------------------------------------------------------

describe("Decimal: parity - comparisons", () => {
  it("comparedTo / eq / gt / gte / lt / lte across pair grid", () => {
    for (const sa of EDGE_INPUTS) {
      for (const sb of EDGE_INPUTS) {
        const a = new Dec(sa);
        const b = new Dec(sb);
        const ja = new DJS(sa);
        const jb = new DJS(sb);
        // decimal.js can return -0 from comparedTo; we always return +0.
        // These are numerically equal so we use loose equality, not Object.is.
        expect(a.comparedTo(b) === Number(ja.comparedTo(jb))).toBe(true);
        expect(a.equals(b)).toBe(ja.equals(jb));
        expect(a.greaterThan(b)).toBe(ja.greaterThan(jb));
        expect(a.greaterThanOrEqualTo(b)).toBe(ja.greaterThanOrEqualTo(jb));
        expect(a.lessThan(b)).toBe(ja.lessThan(jb));
        expect(a.lessThanOrEqualTo(b)).toBe(ja.lessThanOrEqualTo(jb));
      }
    }
  });

  it("random comparisons", () => {
    const rand = rng(54321);
    for (let i = 0; i < 1000; i++) {
      const sa = randDecimalStr(rand);
      const sb = randDecimalStr(rand);
      const c1 = new Dec(sa).comparedTo(new Dec(sb));
      const c2 = new DJS(sa).comparedTo(new DJS(sb));
      if (c1 !== c2) {
        throw new Error(
          `comparedTo diverged: a="${sa}" b="${sb}" ours=${c1} djs=${c2}`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Arithmetic - plus, minus, times
// ---------------------------------------------------------------------------

describe("Decimal: parity - plus / minus / times", () => {
  function checkOp(
    name: "plus" | "minus" | "times",
    sa: string,
    sb: string,
  ): void {
    const a = new Dec(sa);
    const b = new Dec(sb);
    const ja = new DJS(sa);
    const jb = new DJS(sb);
    const ours = a[name](b).toString();
    const theirs = ja[name](jb).toString();
    if (ours !== theirs) {
      throw new Error(
        `${name}("${sa}", "${sb}") diverged: ours=${ours} djs=${theirs}`,
      );
    }
  }

  it("edge × edge grid", () => {
    for (const sa of EDGE_INPUTS) {
      for (const sb of EDGE_INPUTS) {
        checkOp("plus", sa, sb);
        checkOp("minus", sa, sb);
        checkOp("times", sa, sb);
      }
    }
  });

  it("random plus/minus/times - 2000 iterations", () => {
    const rand = rng(11111);
    for (let i = 0; i < 2000; i++) {
      const sa = randDecimalStr(rand);
      const sb = randDecimalStr(rand);
      checkOp("plus", sa, sb);
      checkOp("minus", sa, sb);
      checkOp("times", sa, sb);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Division - most precision-sensitive op
// ---------------------------------------------------------------------------

describe("Decimal: parity - dividedBy", () => {
  function checkDiv(sa: string, sb: string): void {
    const b = new Dec(sb);
    if (b.isZero()) return; // both impls throw; tested separately
    const ours = new Dec(sa).dividedBy(b).toString();
    const theirs = new DJS(sa).dividedBy(new DJS(sb)).toString();
    if (ours !== theirs) {
      throw new Error(
        `dividedBy("${sa}", "${sb}") diverged: ours=${ours} djs=${theirs}`,
      );
    }
  }

  it("edge × edge grid", () => {
    for (const sa of EDGE_INPUTS) {
      for (const sb of EDGE_INPUTS) {
        checkDiv(sa, sb);
      }
    }
  });

  it("known repeating decimals", () => {
    // 1/3, 2/3, 1/7, 22/7
    checkDiv("1", "3");
    checkDiv("2", "3");
    checkDiv("1", "7");
    checkDiv("22", "7");
    checkDiv("1", "9");
    checkDiv("1", "11");
    checkDiv("1", "97"); // long period
  });

  it("random division - 2000 iterations", () => {
    const rand = rng(22222);
    for (let i = 0; i < 2000; i++) {
      const sa = randDecimalStr(rand);
      const sb = randDecimalStr(rand);
      checkDiv(sa, sb);
    }
  });

  it("throws on division by zero", () => {
    expect(() => new Dec("1").dividedBy("0")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. Rounding - toFixed, round/floor/ceil
// ---------------------------------------------------------------------------

describe("Decimal: parity - toFixed / round / floor / ceil", () => {
  it("toFixed at many dp, both default and DOWN modes", () => {
    for (const s of EDGE_INPUTS) {
      const a = new Dec(s);
      const b = new DJS(s);
      for (const dp of [0, 1, 2, 4, 6, 10, 18, 28]) {
        // default = HALF_UP
        const o1 = a.toFixed(dp);
        const t1 = b.toFixed(dp);
        if (o1 !== t1) {
          throw new Error(
            `toFixed("${s}", ${dp}) diverged: ours=${o1} djs=${t1}`,
          );
        }
        // ROUND_DOWN
        const o2 = a.toFixed(dp, Dec.ROUND_DOWN);
        const t2 = b.toFixed(dp, DecimalJS.ROUND_DOWN);
        if (o2 !== t2) {
          throw new Error(
            `toFixed("${s}", ${dp}, DOWN) diverged: ours=${o2} djs=${t2}`,
          );
        }
      }
    }
  });

  it("random toFixed parity - 1000 iterations", () => {
    const rand = rng(33333);
    for (let i = 0; i < 1000; i++) {
      const s = randDecimalStr(rand);
      const dp = Math.floor(rand() * 28);
      const o1 = new Dec(s).toFixed(dp);
      const t1 = new DJS(s).toFixed(dp);
      if (o1 !== t1) {
        throw new Error(
          `toFixed("${s}", ${dp}) diverged: ours=${o1} djs=${t1}`,
        );
      }
      const o2 = new Dec(s).toFixed(dp, Dec.ROUND_DOWN);
      const t2 = new DJS(s).toFixed(dp, DecimalJS.ROUND_DOWN);
      if (o2 !== t2) {
        throw new Error(
          `toFixed("${s}", ${dp}, DOWN) diverged: ours=${o2} djs=${t2}`,
        );
      }
    }
  });

  it("round / floor / ceil", () => {
    for (const s of EDGE_INPUTS) {
      const a = new Dec(s);
      const b = new DJS(s);
      expect(a.round().toString()).toBe(b.round().toString());
      expect(a.floor().toString()).toBe(b.floor().toString());
      expect(a.ceil().toString()).toBe(b.ceil().toString());
    }
  });
});

// ---------------------------------------------------------------------------
// 7. abs / negated
// ---------------------------------------------------------------------------

describe("Decimal: parity - abs / negated", () => {
  it("edge inputs", () => {
    for (const s of EDGE_INPUTS) {
      expect(new Dec(s).abs().toString()).toBe(new DJS(s).abs().toString());
      expect(new Dec(s).negated().toString()).toBe(
        new DJS(s).negated().toString(),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 8. min / max statics
// ---------------------------------------------------------------------------

describe("Decimal: parity - Decimal.min / Decimal.max", () => {
  it("variadic min/max", () => {
    const sets: string[][] = [
      ["1"],
      ["1", "2", "3"],
      ["-1", "1", "0"],
      ["0.1", "0.01", "0.001"],
      ["1e-30", "1e30", "0"],
      ["3.14", "2.71", "-3.14"],
    ];
    for (const set of sets) {
      const ourMin = Dec.min(...set).toString();
      const djsMin = DJS.min(...set).toString();
      expect(ourMin).toBe(djsMin);
      const ourMax = Dec.max(...set).toString();
      const djsMax = DJS.max(...set).toString();
      expect(ourMax).toBe(djsMax);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. pow with integer exponents (the only kind we use)
// ---------------------------------------------------------------------------

describe("Decimal: parity - pow (integer exponent)", () => {
  it("integer powers", () => {
    const cases: Array<[string, number]> = [
      ["2", 0],
      ["2", 1],
      ["2", 10],
      ["2", -1],
      ["2", -10],
      ["10", 5],
      ["10", -5],
      ["10", 18],
      ["10", -18],
      ["-3", 3],
      ["-3", 4],
      ["1.5", 5],
      ["0.5", 10],
      ["0.5", -3],
      ["1", 1000],
    ];
    for (const [base, exp] of cases) {
      const ours = new Dec(base).pow(String(exp)).toString();
      const theirs = new DJS(base).pow(exp).toString();
      if (ours !== theirs) {
        throw new Error(
          `pow("${base}", ${exp}) diverged: ours=${ours} djs=${theirs}`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 10. toSignificantDigits
// ---------------------------------------------------------------------------

describe("Decimal: parity - toSignificantDigits", () => {
  it("various sigFig counts", () => {
    for (const s of EDGE_INPUTS) {
      if (s === "0" || s === "-0" || s === "0.0" || s === "0.00000") continue; // both return "0"
      for (const sf of [1, 2, 3, 5, 10, 28]) {
        const ours = new Dec(s).toSignificantDigits(sf).toString();
        const theirs = new DJS(s).toSignificantDigits(sf).toString();
        if (ours !== theirs) {
          throw new Error(
            `toSignificantDigits("${s}", ${sf}) diverged: ours=${ours} djs=${theirs}`,
          );
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 11. floorLog10 - replaces .log(10).floor() in the lib internals
// ---------------------------------------------------------------------------

describe("Decimal: floorLog10 matches floor(log10(value))", () => {
  it("known values", () => {
    const cases: Array<[string, number]> = [
      ["1", 0],
      ["2", 0],
      ["9.999", 0],
      ["10", 1],
      ["99.999", 1],
      ["100", 2],
      ["1000", 3],
      ["0.1", -1],
      ["0.01", -2],
      ["0.001", -3],
      ["0.5", -1],
      ["1e-15", -15],
      ["1e+15", 15],
      ["1.2345e-7", -7],
    ];
    for (const [s, expected] of cases) {
      expect(new Dec(s).floorLog10().toNumber()).toBe(expected);
    }
  });

  it("matches decimal.js .log(10).floor() over random positive inputs", () => {
    const rand = rng(77777);
    for (let i = 0; i < 500; i++) {
      // Generate strictly positive
      let s = randDecimalStr(rand);
      if (s.startsWith("-")) s = s.slice(1);
      if (new Dec(s).isZero()) continue;
      const ours = new Dec(s).floorLog10().toNumber();
      const theirs = new DJS(s).log(10).floor().toNumber();
      if (ours !== theirs) {
        throw new Error(
          `floorLog10("${s}") diverged: ours=${ours} djs=${theirs}`,
        );
      }
    }
  });

  it("throws on zero", () => {
    expect(() => new Dec("0").floorLog10()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 12. toNumber
// ---------------------------------------------------------------------------

describe("Decimal: parity - toNumber", () => {
  it("edge inputs that fit in Number", () => {
    const safe = EDGE_INPUTS.filter((s) => Number.isFinite(parseFloat(s)));
    for (const s of safe) {
      const ours = new Dec(s).toNumber();
      const theirs = new DJS(s).toNumber();
      // NaN equality is false, so check both are NaN OR equal numbers.
      // decimal.js can return -0 from toNumber("-0"); we return +0. Use
      // loose equality (`==` returns true for `+0 == -0`).
      if (Number.isNaN(ours) && Number.isNaN(theirs)) continue;
      expect(ours === theirs).toBe(true);
    }
  });

  it("random toNumber parity (only values in finite Number range)", () => {
    const rand = rng(88888);
    for (let i = 0; i < 500; i++) {
      const s = randDecimalStr(rand, 15, 12);
      const f = parseFloat(s);
      if (!Number.isFinite(f)) continue;
      const ours = new Dec(s).toNumber();
      const theirs = new DJS(s).toNumber();
      expect(ours).toBe(theirs);
    }
  });
});
