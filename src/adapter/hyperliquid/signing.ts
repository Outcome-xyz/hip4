// ---------------------------------------------------------------------------
// Hyperliquid L1 Action Signing
//
// Implements the correct signing flow for Hyperliquid exchange actions:
//   1. Sort action keys in canonical order
//   2. MessagePack-encode the action
//   3. Append nonce (big-endian uint64) + vault marker
//   4. Keccak-256 hash
//   5. EIP-712 sign with Agent type (chainId=1337, source="a"/"b")
//
// Zero runtime dependencies - msgpack encoder and keccak-256 are implemented
// inline using the public specifications.
// ---------------------------------------------------------------------------

import type {
  HIP4Signer,
  HLBatchModifyAction,
  HLCancelAction,
  HLModifyAction,
  HLOrderAction,
  HLOrderWire,
  HLScheduleCancelAction,
  HLSignature,
  HLUserOutcomeAction,
} from "./types";
import { normalizeSignature } from "./types";

// ---------------------------------------------------------------------------
// MessagePack Encoder (minimal subset)
// ---------------------------------------------------------------------------

/**
 * Minimal MessagePack encoder supporting: maps, arrays, strings, integers,
 * booleans, and null. Floats are not needed (prices are strings in wire format).
 *
 * Spec: https://github.com/msgpack/msgpack/blob/master/spec.md
 */
export function encodeMsgpack(value: unknown): Uint8Array {
  const parts: Uint8Array[] = [];
  encodeValue(value, parts);
  // Concatenate all parts
  let totalLen = 0;
  for (const p of parts) totalLen += p.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

function encodeValue(value: unknown, parts: Uint8Array[]): void {
  if (value === null || value === undefined) {
    parts.push(new Uint8Array([0xc0]));
    return;
  }

  if (typeof value === "boolean") {
    parts.push(new Uint8Array([value ? 0xc3 : 0xc2]));
    return;
  }

  if (typeof value === "number") {
    encodeNumber(value, parts);
    return;
  }

  if (typeof value === "string") {
    encodeString(value, parts);
    return;
  }

  if (Array.isArray(value)) {
    encodeArray(value, parts);
    return;
  }

  if (typeof value === "object") {
    encodeMap(value as Record<string, unknown>, parts);
    return;
  }

  throw new Error(`msgpack: unsupported type ${typeof value}`);
}

function encodeNumber(n: number, parts: Uint8Array[]): void {
  if (!Number.isInteger(n)) {
    // Encode as float64 (0xcb)
    const buf = new ArrayBuffer(9);
    const view = new DataView(buf);
    view.setUint8(0, 0xcb);
    view.setFloat64(1, n);
    parts.push(new Uint8Array(buf));
    return;
  }

  if (n >= 0) {
    if (n <= 0x7f) {
      // positive fixint
      parts.push(new Uint8Array([n]));
    } else if (n <= 0xff) {
      parts.push(new Uint8Array([0xcc, n]));
    } else if (n <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = 0xcd;
      buf[1] = (n >> 8) & 0xff;
      buf[2] = n & 0xff;
      parts.push(buf);
    } else if (n <= 0xffffffff) {
      const buf = new Uint8Array(5);
      buf[0] = 0xce;
      buf[1] = (n >> 24) & 0xff;
      buf[2] = (n >> 16) & 0xff;
      buf[3] = (n >> 8) & 0xff;
      buf[4] = n & 0xff;
      parts.push(buf);
    } else {
      // uint64
      const buf = new Uint8Array(9);
      buf[0] = 0xcf;
      const big = BigInt(n);
      const view = new DataView(buf.buffer);
      view.setBigUint64(1, big);
      parts.push(buf);
    }
  } else {
    // negative
    if (n >= -32) {
      // negative fixint: 0xe0 | (n & 0x1f)
      parts.push(new Uint8Array([(0x100 + n) & 0xff]));
    } else if (n >= -128) {
      const buf = new Uint8Array(2);
      buf[0] = 0xd0;
      buf[1] = (0x100 + n) & 0xff;
      parts.push(buf);
    } else if (n >= -32768) {
      const buf = new Uint8Array(3);
      buf[0] = 0xd1;
      const view = new DataView(buf.buffer);
      view.setInt16(1, n);
      parts.push(buf);
    } else if (n >= -2147483648) {
      const buf = new Uint8Array(5);
      buf[0] = 0xd2;
      const view = new DataView(buf.buffer);
      view.setInt32(1, n);
      parts.push(buf);
    } else {
      const buf = new Uint8Array(9);
      buf[0] = 0xd3;
      const view = new DataView(buf.buffer);
      view.setBigInt64(1, BigInt(n));
      parts.push(buf);
    }
  }
}

function encodeString(s: string, parts: Uint8Array[]): void {
  const encoded = new TextEncoder().encode(s);
  const len = encoded.length;

  if (len <= 31) {
    parts.push(new Uint8Array([0xa0 | len]));
  } else if (len <= 0xff) {
    parts.push(new Uint8Array([0xd9, len]));
  } else if (len <= 0xffff) {
    parts.push(new Uint8Array([0xda, (len >> 8) & 0xff, len & 0xff]));
  } else {
    parts.push(
      new Uint8Array([
        0xdb,
        (len >> 24) & 0xff,
        (len >> 16) & 0xff,
        (len >> 8) & 0xff,
        len & 0xff,
      ]),
    );
  }
  parts.push(encoded);
}

function encodeArray(arr: unknown[], parts: Uint8Array[]): void {
  const len = arr.length;
  if (len <= 15) {
    parts.push(new Uint8Array([0x90 | len]));
  } else if (len <= 0xffff) {
    parts.push(new Uint8Array([0xdc, (len >> 8) & 0xff, len & 0xff]));
  } else {
    parts.push(
      new Uint8Array([
        0xdd,
        (len >> 24) & 0xff,
        (len >> 16) & 0xff,
        (len >> 8) & 0xff,
        len & 0xff,
      ]),
    );
  }
  for (const item of arr) {
    encodeValue(item, parts);
  }
}

function encodeMap(obj: Record<string, unknown>, parts: Uint8Array[]): void {
  const keys = Object.keys(obj);
  const len = keys.length;
  if (len <= 15) {
    parts.push(new Uint8Array([0x80 | len]));
  } else if (len <= 0xffff) {
    parts.push(new Uint8Array([0xde, (len >> 8) & 0xff, len & 0xff]));
  } else {
    parts.push(
      new Uint8Array([
        0xdf,
        (len >> 24) & 0xff,
        (len >> 16) & 0xff,
        (len >> 8) & 0xff,
        len & 0xff,
      ]),
    );
  }
  for (const key of keys) {
    encodeString(key, parts);
    encodeValue(obj[key], parts);
  }
}

// ---------------------------------------------------------------------------
// Keccak-256
// ---------------------------------------------------------------------------

const KECCAK_ROUND_CONSTANTS: bigint[] = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];

const ROTATION_OFFSETS = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
];

// Pi permutation: for linear index i = x + 5*y, new index = y + 5*(2*x + 3*y) % 5
// Precompute the mapping
const PI_PERMUTATION: number[] = new Array(25);
for (let x = 0; x < 5; x++) {
  for (let y = 0; y < 5; y++) {
    const fromIdx = x + 5 * y;
    const newX = y;
    const newY = (2 * x + 3 * y) % 5;
    PI_PERMUTATION[fromIdx] = newX + 5 * newY;
  }
}

const MASK64 = 0xffffffffffffffffn;

function rotl64(x: bigint, n: number): bigint {
  if (n === 0) return x;
  return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK64;
}

function keccakF1600(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // Theta
    const c = new Array<bigint>(5);
    for (let x = 0; x < 5; x++) {
      c[x] =
        state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) {
        state[x + 5 * y] = (state[x + 5 * y] ^ d) & MASK64;
      }
    }

    // Rho + Pi (combined)
    const temp = new Array<bigint>(25);
    for (let i = 0; i < 25; i++) {
      temp[PI_PERMUTATION[i]] = rotl64(state[i], ROTATION_OFFSETS[i]);
    }

    // Chi
    for (let y = 0; y < 5; y++) {
      const base = 5 * y;
      const t0 = temp[base];
      const t1 = temp[base + 1];
      const t2 = temp[base + 2];
      const t3 = temp[base + 3];
      const t4 = temp[base + 4];
      state[base] = (t0 ^ (~t1 & MASK64 & t2)) & MASK64;
      state[base + 1] = (t1 ^ (~t2 & MASK64 & t3)) & MASK64;
      state[base + 2] = (t2 ^ (~t3 & MASK64 & t4)) & MASK64;
      state[base + 3] = (t3 ^ (~t4 & MASK64 & t0)) & MASK64;
      state[base + 4] = (t4 ^ (~t0 & MASK64 & t1)) & MASK64;
    }

    // Iota
    state[0] = (state[0] ^ KECCAK_ROUND_CONSTANTS[round]) & MASK64;
  }
}

/**
 * Keccak-256 hash (Ethereum variant).
 *
 * Parameters: rate=1088 bits (136 bytes), capacity=512 bits, output=256 bits.
 * Padding: Keccak (suffix 0x01), NOT SHA-3 (suffix 0x06).
 */
export function keccak256(data: Uint8Array): Uint8Array {
  const rate = 136; // bytes
  const state = new Array<bigint>(25).fill(0n);

  // Absorb
  let offset = 0;
  while (offset + rate <= data.length) {
    xorBlock(state, data, offset, rate);
    keccakF1600(state);
    offset += rate;
  }

  // Pad last block
  const remaining = data.length - offset;
  const lastBlock = new Uint8Array(rate);
  lastBlock.set(data.subarray(offset, offset + remaining));
  // Keccak padding: 0x01 after message, 0x80 at end of block
  lastBlock[remaining] = 0x01;
  lastBlock[rate - 1] |= 0x80;
  xorBlock(state, lastBlock, 0, rate);
  keccakF1600(state);

  // Squeeze (only need 32 bytes = 256 bits, which is < rate)
  const output = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    const word = state[i];
    for (let b = 0; b < 8; b++) {
      output[i * 8 + b] = Number((word >> BigInt(b * 8)) & 0xffn);
    }
  }
  return output;
}

function xorBlock(
  state: bigint[],
  data: Uint8Array,
  offset: number,
  len: number,
): void {
  const words = len / 8;
  for (let i = 0; i < words; i++) {
    let word = 0n;
    const base = offset + i * 8;
    for (let b = 0; b < 8; b++) {
      word |= BigInt(data[base + b]) << BigInt(b * 8);
    }
    state[i] = (state[i] ^ word) & MASK64;
  }
}

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(raw.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Action Key Sorting
// ---------------------------------------------------------------------------

/**
 * Strip trailing zeros from a decimal string.
 * "0.5000" → "0.5", "10.00" → "10", "3" → "3" (no-op if no decimal point).
 * Matches @nktkas/hyperliquid formatDecimal behavior.
 */
function formatDecimal(numStr: string): string {
  // Handle scientific notation (e.g. "1e-5" → "0.00001")
  if (numStr.includes("e") || numStr.includes("E")) {
    numStr = Number(numStr).toFixed(20);
  }
  if (!numStr.includes(".")) return numStr;
  const [intPart, fracPart] = numStr.split(".");
  const trimmed = fracPart.replace(/0+$/, "");
  return trimmed ? `${intPart}.${trimmed}` : intPart;
}

/**
 * Sort an order action into canonical key order for MessagePack encoding.
 * Key order: type, orders, grouping, builder?
 * Order wire key order: a, b, p, s, r, t, c?
 * Trigger type key order: isMarket, triggerPx, tpsl
 */
export function sortOrderAction(
  action: HLOrderAction & { builder?: { b: string; f: number } },
): HLOrderAction {
  const sortedOrders = action.orders.map((o) => {
    // Sort the 't' field if it's a trigger type
    let t = o.t;
    if ("trigger" in t) {
      t = {
        trigger: {
          isMarket: t.trigger.isMarket,
          triggerPx: formatDecimal(t.trigger.triggerPx),
          tpsl: t.trigger.tpsl,
        },
      };
    }

    const wire: Record<string, unknown> = {
      a: o.a,
      b: o.b,
      p: formatDecimal(o.p),
      s: formatDecimal(o.s),
      r: o.r,
      t: t,
    };
    // Only include 'c' if it exists and is defined
    if (o.c !== undefined) {
      wire.c = o.c;
    }
    return wire;
  });

  // Canonical order: type, orders, grouping, builder?
  const sorted: Record<string, unknown> = {
    type: action.type,
    orders: sortedOrders,
    grouping: action.grouping,
  };

  // Include builder only if present, with canonical key order and lowercased address
  if (action.builder !== undefined) {
    sorted.builder = {
      b: action.builder.b.toLowerCase(),
      f: action.builder.f,
    };
  }

  return sorted as unknown as HLOrderAction;
}

/**
 * Sort a cancel action into canonical key order.
 * Key order: type, cancels
 * Cancel wire key order: a, o
 */
export function sortCancelAction(action: HLCancelAction): HLCancelAction {
  const sortedCancels = action.cancels.map((c) => ({
    a: c.a,
    o: c.o,
  }));

  return {
    type: action.type,
    cancels: sortedCancels,
  };
}

/**
 * Apply the same canonical ordering to an order wire that sortOrderAction
 * does (a, b, p, s, r, t, c?) - shared between place-order and modify paths.
 */
function sortOrderWire(o: HLOrderWire): HLOrderWire {
  let t = o.t;
  if ("trigger" in t) {
    t = {
      trigger: {
        isMarket: t.trigger.isMarket,
        triggerPx: formatDecimal(t.trigger.triggerPx),
        tpsl: t.trigger.tpsl,
      },
    };
  }
  const wire: Record<string, unknown> = {
    a: o.a,
    b: o.b,
    p: formatDecimal(o.p),
    s: formatDecimal(o.s),
    r: o.r,
    t: t,
  };
  if (o.c !== undefined) {
    wire.c = o.c;
  }
  return wire as unknown as HLOrderWire;
}

/**
 * Sort a modify action into canonical key order.
 * Key order: type, oid, order
 * Inner order wire uses the same canonical order as place-order.
 */
export function sortModifyAction(action: HLModifyAction): HLModifyAction {
  return {
    type: action.type,
    oid: action.oid,
    order: sortOrderWire(action.order),
  };
}

/**
 * Sort a batchModify action into canonical key order.
 * Key order: type, modifies. Each modify entry uses key order: oid, order.
 */
export function sortBatchModifyAction(
  action: HLBatchModifyAction,
): HLBatchModifyAction {
  return {
    type: action.type,
    modifies: action.modifies.map((m) => ({
      oid: m.oid,
      order: sortOrderWire(m.order),
    })),
  };
}

/**
 * Sort a userOutcome action into canonical key order for MessagePack.
 * Outer key order: type, <variant-key>. Inner key orders match HL's docs:
 *   splitOutcome:    outcome, amount
 *   mergeOutcome:    outcome, amount
 *   mergeQuestion:   question, amount
 *   negateQuestion:  question, outcome, amount
 *
 * `amount` is run through formatDecimal so trailing zeros do not desync the
 * client signature from HL's server-side hash. `null` is preserved (encodes
 * as msgpack 0xc0 / "max amount").
 */
export function sortUserOutcomeAction(
  action: HLUserOutcomeAction,
): HLUserOutcomeAction {
  if ("splitOutcome" in action) {
    const { outcome, amount } = action.splitOutcome;
    return {
      type: "userOutcome",
      splitOutcome: { outcome, amount: formatDecimal(amount) },
    };
  }
  if ("mergeOutcome" in action) {
    const { outcome, amount } = action.mergeOutcome;
    return {
      type: "userOutcome",
      mergeOutcome: {
        outcome,
        amount: amount === null ? null : formatDecimal(amount),
      },
    };
  }
  if ("mergeQuestion" in action) {
    const { question, amount } = action.mergeQuestion;
    return {
      type: "userOutcome",
      mergeQuestion: {
        question,
        amount: amount === null ? null : formatDecimal(amount),
      },
    };
  }
  const { question, outcome, amount } = action.negateOutcome;
  return {
    type: "userOutcome",
    negateOutcome: { question, outcome, amount: formatDecimal(amount) },
  };
}

/**
 * Sort a scheduleCancel action into canonical key order. Outer keys:
 * `type, time`. Time may be `null` to clear an existing schedule.
 */
export function sortScheduleCancelAction(
  action: HLScheduleCancelAction,
): HLScheduleCancelAction {
  return { type: action.type, time: action.time };
}

// ---------------------------------------------------------------------------
// L1 Action Hash
// ---------------------------------------------------------------------------

/**
 * Create the Keccak-256 hash of an L1 action for signing.
 *
 * Hash input = msgpack(action) + nonce_be64 + vault_marker
 * vault_marker = 0x00 (no vault) | 0x01 + 20-byte address
 */
export function createL1ActionHash(params: {
  action:
    | Record<string, unknown>
    | HLOrderAction
    | HLCancelAction
    | HLModifyAction
    | HLBatchModifyAction
    | HLUserOutcomeAction
    | HLScheduleCancelAction;
  nonce: number;
  vaultAddress?: string | null;
}): Uint8Array {
  const { action, nonce, vaultAddress } = params;

  // Step 1: MessagePack encode the action
  const msgpackBytes = encodeMsgpack(action);

  // Step 2: Nonce as big-endian uint64
  const nonceBytes = new Uint8Array(8);
  const nonceView = new DataView(nonceBytes.buffer);
  nonceView.setBigUint64(0, BigInt(nonce));

  // Step 3: Vault marker
  let vaultBytes: Uint8Array;
  if (vaultAddress) {
    const addrBytes = hexToBytes(vaultAddress);
    vaultBytes = new Uint8Array(1 + 20);
    vaultBytes[0] = 0x01;
    vaultBytes.set(addrBytes.slice(0, 20), 1);
  } else {
    vaultBytes = new Uint8Array([0x00]);
  }

  // Concatenate
  const totalLen = msgpackBytes.length + nonceBytes.length + vaultBytes.length;
  const combined = new Uint8Array(totalLen);
  combined.set(msgpackBytes, 0);
  combined.set(nonceBytes, msgpackBytes.length);
  combined.set(vaultBytes, msgpackBytes.length + nonceBytes.length);

  // Step 4: Keccak-256
  return keccak256(combined);
}

// ---------------------------------------------------------------------------
// EIP-712 Agent Signing
// ---------------------------------------------------------------------------

const AGENT_DOMAIN = {
  name: "Exchange",
  version: "1",
  chainId: 1337,
  verifyingContract: "0x0000000000000000000000000000000000000000",
};

const AGENT_TYPES = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
};

/**
 * Sign a Hyperliquid L1 action.
 *
 * 1. Compute actionHash = keccak256(msgpack(action) + nonce_be64 + vault_marker)
 * 2. EIP-712 sign with Agent type: { source: "a"/"b", connectionId: actionHash }
 */
export async function signL1Action(params: {
  signer: HIP4Signer;
  action:
    | Record<string, unknown>
    | HLOrderAction
    | HLCancelAction
    | HLModifyAction
    | HLBatchModifyAction
    | HLUserOutcomeAction
    | HLScheduleCancelAction;
  nonce: number;
  isTestnet: boolean;
  vaultAddress?: string | null;
}): Promise<HLSignature> {
  const { signer, action, nonce, isTestnet, vaultAddress } = params;

  const actionHash = createL1ActionHash({ action, nonce, vaultAddress });
  const connectionId = bytesToHex(actionHash);

  const message = {
    source: isTestnet ? "b" : "a",
    connectionId,
  };

  const rawSig = await signer.signTypedData(
    AGENT_DOMAIN as unknown as Record<string, unknown>,
    AGENT_TYPES,
    message,
  );

  return normalizeSignature(rawSig);
}

// ---------------------------------------------------------------------------
// User-Signed EIP-712 (HyperliquidSignTransaction domain)
//
// Used for wallet-level operations: withdraw, usdClassTransfer, usdSend,
// approveAgent, approveBuilderFee, etc. NOT used for orders/cancels (those
// always use L1 agent signing above).
//
// Reference: @nktkas/hyperliquid signing/mod.ts - signUserSignedAction
// ---------------------------------------------------------------------------

/** EIP-712 types for withdraw3. */
export const WITHDRAW_TYPES = {
  "HyperliquidTransaction:Withdraw": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "amount", type: "string" },
    { name: "time", type: "uint64" },
  ],
};

/** EIP-712 types for usdClassTransfer (spot ↔ perp). */
export const USD_CLASS_TRANSFER_TYPES = {
  "HyperliquidTransaction:UsdClassTransfer": [
    { name: "hyperliquidChain", type: "string" },
    { name: "amount", type: "string" },
    { name: "toPerp", type: "bool" },
    { name: "nonce", type: "uint64" },
  ],
};

/** EIP-712 types for usdSend. */
export const USD_SEND_TYPES = {
  "HyperliquidTransaction:UsdSend": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "amount", type: "string" },
    { name: "time", type: "uint64" },
  ],
};

/** EIP-712 types for spotSend (transfer any spot token to another user). */
export const SPOT_SEND_TYPES = {
  "HyperliquidTransaction:SpotSend": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "time", type: "uint64" },
  ],
};

/**
 * EIP-712 types for sendAsset - the unified-account-compatible transfer
 * primitive. Supersedes spotSend / usdSend / subAccountSpotTransfer /
 * usdClassTransfer when an account is in `unifiedAccount` or
 * `portfolioMargin` mode (where silo-specific actions are rejected with
 * "Action disabled when unified account is active").
 *
 * `sourceDex` / `destinationDex`: `""` for perp USDC, `"spot"` for spot.
 * Core→EVM transfers use `destination` = the token's system address and
 * leave `destinationDex` as `""`.
 *
 * Ref: @nktkas/hyperliquid src/api/exchange/_methods/sendAsset.ts
 */
export const SEND_ASSET_TYPES = {
  "HyperliquidTransaction:SendAsset": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "sourceDex", type: "string" },
    { name: "destinationDex", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "fromSubAccount", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
};

/**
 * EIP-712 types for sendToEvmWithData (Core → EVM transfer invoking the
 * linked contract's `coreReceiveWithData` hook). Field order matches the
 * canonical Hyperliquid spec; deviations break signature verification.
 *
 * Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
 */
export const SEND_TO_EVM_WITH_DATA_TYPES = {
  "HyperliquidTransaction:SendToEvmWithData": [
    { name: "hyperliquidChain", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "sourceDex", type: "string" },
    { name: "destinationRecipient", type: "string" },
    { name: "addressEncoding", type: "string" },
    { name: "destinationChainId", type: "uint32" },
    { name: "gasLimit", type: "uint64" },
    { name: "data", type: "bytes" },
    { name: "nonce", type: "uint64" },
  ],
};

/**
 * Sign a user-signed action (EIP-712 on HyperliquidSignTransaction domain).
 *
 * The action must include `signatureChainId` (hex chain ID for the EIP-712
 * domain). The message is filtered to only include keys defined in `types`.
 *
 * Reference: @nktkas/hyperliquid signing/mod.ts
 */
export async function signUserSignedAction(params: {
  signer: HIP4Signer;
  action: Record<string, unknown> & { signatureChainId: string };
  types: Record<string, Array<{ name: string; type: string }>>;
}): Promise<HLSignature> {
  const { signer, action, types } = params;

  const primaryType = Object.keys(types)[0];
  if (!primaryType || !types[primaryType]) {
    throw new Error("EIP-712 types object is empty");
  }

  // Filter action to only include keys defined in types (wallet compat)
  const knownKeys = new Set(types[primaryType].map((f) => f.name));
  const message: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(action)) {
    if (knownKeys.has(k)) message[k] = v;
  }

  const chainId = parseInt(action.signatureChainId, 16);
  if (isNaN(chainId)) {
    throw new Error(`Invalid signatureChainId: "${action.signatureChainId}"`);
  }

  const domain = {
    name: "HyperliquidSignTransaction",
    version: "1",
    chainId,
    verifyingContract: "0x0000000000000000000000000000000000000000",
  };

  const rawSig = await signer.signTypedData(
    domain as unknown as Record<string, unknown>,
    types,
    message,
  );

  return normalizeSignature(rawSig);
}
