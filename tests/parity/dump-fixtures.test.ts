// One-off harness: imports the TS SDK's *internal* signing helpers (which
// aren't exported from the public surface) and writes fixture JSON consumed
// by hip4-py's parity test (`tests/unit/test_signing_parity.py`).
//
// Run via:
//   pnpm vitest run tests/parity/dump-fixtures.test.ts
//
// Outputs to `tests/parity/fixtures.json` in this repo. Copy it into the
// Python repo at `tests/fixtures/ts_signing_parity.json`.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createL1ActionHash,
  encodeMsgpack,
  sortCancelAction,
  sortModifyAction,
  sortOrderAction,
  sortScheduleCancelAction,
  sortUserOutcomeAction,
} from "../../src/adapter/hyperliquid/signing";

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

interface Fixture {
  description: string;
  // Input
  rawAction: unknown;
  nonce: number;
  vaultAddress: string | null;
  // Outputs to match
  sortedAction: unknown;
  msgpackHex: string;
  actionHashHex: string;
}

function dump(
  description: string,
  rawAction: any,
  sortedAction: any,
  nonce: number,
  vaultAddress: string | null,
): Fixture {
  const msgpackBytes = encodeMsgpack(sortedAction);
  const hash = createL1ActionHash({
    action: sortedAction,
    nonce,
    vaultAddress,
  });
  return {
    description,
    rawAction,
    nonce,
    vaultAddress,
    sortedAction,
    msgpackHex: bytesToHex(msgpackBytes),
    actionHashHex: bytesToHex(hash),
  };
}

describe("dump signing fixtures", () => {
  it("writes fixtures.json", () => {
    const fixtures: Fixture[] = [];

    // 1. Simple GTC limit order, no builder.
    {
      const raw = {
        type: "order" as const,
        orders: [
          {
            a: 100000010,
            b: true,
            p: "0.5",
            s: "20",
            r: false,
            t: { limit: { tif: "Gtc" as const } },
          },
        ],
        grouping: "na" as const,
      };
      const sorted = sortOrderAction(raw);
      fixtures.push(
        dump("simple-limit-order", raw, sorted, 1234567890123, null),
      );
    }

    // 2. Order with builder fee + uppercased address.
    {
      const raw = {
        type: "order" as const,
        orders: [
          {
            a: 100000010,
            b: false,
            p: "0.65000",
            s: "100.00",
            r: false,
            t: { limit: { tif: "Ioc" as const } },
          },
        ],
        grouping: "na" as const,
        builder: { b: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12", f: 100 },
      };
      const sorted = sortOrderAction(raw);
      fixtures.push(dump("order-with-builder", raw, sorted, 999, null));
    }

    // 3. Order with cloid and trigger.
    {
      const raw = {
        type: "order" as const,
        orders: [
          {
            a: 100000020,
            b: true,
            p: "0",
            s: "10",
            r: true,
            t: {
              trigger: {
                isMarket: true,
                triggerPx: "0.50000",
                tpsl: "tp" as const,
              },
            },
            c: "0x000000000000000000000000000000aa",
          },
        ],
        grouping: "na" as const,
      };
      const sorted = sortOrderAction(raw);
      fixtures.push(dump("trigger-order-with-cloid", raw, sorted, 1, null));
    }

    // 4. Cancel.
    {
      const raw = {
        type: "cancel" as const,
        cancels: [{ a: 100000001, o: 12345 }],
      };
      const sorted = sortCancelAction(raw);
      fixtures.push(dump("cancel-single", raw, sorted, 42, null));
    }

    // 5. Cancel multi.
    {
      const raw = {
        type: "cancel" as const,
        cancels: [
          { a: 100000001, o: 1 },
          { a: 100000002, o: 2 },
          { a: 100000003, o: 3 },
        ],
      };
      const sorted = sortCancelAction(raw);
      fixtures.push(dump("cancel-multi", raw, sorted, 7, null));
    }

    // 6. Modify.
    {
      const raw = {
        type: "modify" as const,
        oid: 99999,
        order: {
          a: 100000010,
          b: true,
          p: "0.50000",
          s: "10",
          r: false,
          t: { limit: { tif: "Gtc" as const } },
        },
      };
      const sorted = sortModifyAction(raw);
      fixtures.push(dump("modify", raw, sorted, 1, null));
    }

    // 7. Vault-attached cancel.
    {
      const raw = { type: "cancel" as const, cancels: [{ a: 1, o: 1 }] };
      const sorted = sortCancelAction(raw);
      fixtures.push(
        dump(
          "cancel-with-vault",
          raw,
          sorted,
          100,
          "0x1111111111111111111111111111111111111111",
        ),
      );
    }

    // 8. userOutcome - splitOutcome.
    {
      const raw = {
        type: "userOutcome" as const,
        splitOutcome: { outcome: 5, amount: "12.500" },
      };
      const sorted = sortUserOutcomeAction(raw);
      fixtures.push(dump("split-outcome", raw, sorted, 50, null));
    }

    // 9. userOutcome - mergeOutcome with null amount (max).
    {
      const raw = {
        type: "userOutcome" as const,
        mergeOutcome: { outcome: 5, amount: null },
      };
      const sorted = sortUserOutcomeAction(raw);
      fixtures.push(dump("merge-outcome-max", raw, sorted, 51, null));
    }

    // 10. userOutcome - negateOutcome (the `negateOutcome` wire key, not `negateQuestion`).
    {
      const raw = {
        type: "userOutcome" as const,
        negateOutcome: { question: 1, outcome: 5, amount: "10.00" },
      };
      const sorted = sortUserOutcomeAction(raw);
      fixtures.push(dump("negate-outcome", raw, sorted, 52, null));
    }

    // 11. scheduleCancel.
    {
      const raw = { type: "scheduleCancel" as const, time: 1700000000000 };
      const sorted = sortScheduleCancelAction(raw);
      fixtures.push(dump("schedule-cancel", raw, sorted, 60, null));
    }

    // 12. scheduleCancel with null (clear).
    {
      const raw = { type: "scheduleCancel" as const, time: null };
      const sorted = sortScheduleCancelAction(raw);
      fixtures.push(dump("schedule-cancel-clear", raw, sorted, 61, null));
    }

    const out = {
      generatedBy: "@outcome.xyz/hip4 internal signing helpers",
      sdkVersion: "1.0.1-beta",
      fixtures,
    };

    const outPath = resolve(__dirname, "fixtures.json");
    writeFileSync(outPath, JSON.stringify(out, null, 2));
    expect(fixtures.length).toBeGreaterThan(0);
  });
});
