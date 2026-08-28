// ---------------------------------------------------------------------------
// Hyperliquid native multi-sig
//
// @experimental Exercised end to end on testnet, 19 Aug 2026, against a 2 of 3
// master that is also an active HIP-4 outcome deployer: `approveAgent`,
// `userSetAbstraction`, `convertToMultiSigUser`, `tokenDelegate` and
// `cDeposit` through the quorum, plus an L1 `outcomeDeploy` registration.
//
// The shape of the thing:
//
//   Every action from a converted account is wrapped. Each authorised signer
//   produces an INNER signature over the action plus the multi-sig account and
//   the leader's address. A leader, who must be an authorised user and cannot
//   be the multi-sig account itself, collects at least `threshold` of them,
//   wraps them in a `multiSig` action, and signs the OUTER envelope.
//
//   Every signature has to be over the same nonce and the same leader, so take
//   the nonce once and pass it to each signer.
//
//   Inner signatures for L1 actions use the phantom agent domain on chain
//   1337, which no browser wallet will sign, so those need raw keys. Inner
//   signatures for user-signed actions use a real chain id and ordinary typed
//   data, so a browser wallet or a custodian can produce them. That asymmetry
//   is why deploying and settling get delegated to an agent, and why the
//   quorum only has to sign account-level actions.
//
//   Conversion preserves both deployer status and account abstraction on a
//   live, staked deployer. What it does not preserve is the ability to act
//   alone: the account can no longer sign for itself.
//
//   Two things make the exchange answer `Invalid multi-sig outer signer` when
//   the outer signer is fine: a checksummed address anywhere in the action,
//   and zero-padded `r` or `s` in the inner signatures. See `lowerAddress` and
//   `minimalSignatureHex`; both are applied for you on the supported paths.
// ---------------------------------------------------------------------------

import {
  bytesToHex,
  createL1ActionHash,
  signL1Action,
  signUserSignedAction,
} from "../adapter/hyperliquid/signing";
import type { HIP4Signer, HLSignature } from "../adapter/hyperliquid/types";
import { lowerAddress, signatureChainId } from "./actions";
import { DeployerError } from "./error";
import { SEND_MULTI_SIG_TYPES } from "./signing-types";
import type { Eip712Fields, Eip712Types } from "./signing-types";
import type { HLMultiSigAction, HLNetwork } from "./types";

/**
 * `userSetAbstraction` carries the mode as a single letter inside a multi-sig
 * payload, where a bare action spells it out.
 */
export const ABSTRACTION_WIRE_VALUES: Record<string, string> = {
  disabled: "i",
  unifiedAccount: "u",
  portfolioMargin: "p",
};

/**
 * The action as it goes inside the multi-sig payload. Only
 * `userSetAbstraction` differs from its bare form.
 */
export function multiSigPayloadAction(
  action: Record<string, unknown>,
): Record<string, unknown> {
  if (action.type !== "userSetAbstraction") return action;
  const wire = ABSTRACTION_WIRE_VALUES[String(action.abstraction)];
  return wire === undefined ? action : { ...action, abstraction: wire };
}

/**
 * Add `payloadMultiSigUser` and `outerSigner` to an EIP-712 type table,
 * immediately after `hyperliquidChain`. Position is part of the struct hash.
 */
export function withMultiSigTypes(types: Eip712Types): Eip712Types {
  const primaryType = Object.keys(types)[0];
  const fields = primaryType ? types[primaryType] : undefined;
  if (!primaryType || !fields) {
    throw new DeployerError("EIP-712 types object is empty");
  }
  const enriched: Eip712Fields = [];
  let inserted = false;
  for (const field of fields) {
    enriched.push(field);
    if (field.name === "hyperliquidChain") {
      enriched.push({ name: "payloadMultiSigUser", type: "address" });
      enriched.push({ name: "outerSigner", type: "address" });
      inserted = true;
    }
  }
  if (!inserted) {
    throw new DeployerError(
      `EIP-712 type "${primaryType}" has no hyperliquidChain field, so it cannot carry multi-sig fields`,
    );
  }
  return { [primaryType]: enriched };
}

export interface MultiSigInnerParams {
  /** One authorised user of the multi-sig account. */
  signer: HIP4Signer;
  /** The multi-sig account the action is performed on behalf of. */
  multiSigUser: string;
  /** The authorised user who will submit. Same for every inner signature. */
  outerSigner: string;
  network: HLNetwork;
}

/**
 * One authorised user's signature over an L1 action, such as `outcomeDeploy` or
 * `activateOutcomeDeployer`.
 *
 * Signed over the array `[multiSigUser, outerSigner, action]` on the phantom
 * agent domain, so this needs a raw key rather than a browser wallet.
 */
export async function signMultiSigInnerL1Action(
  params: MultiSigInnerParams & {
    action: Record<string, unknown>;
    /** Must match the nonce every other signer and the leader use. */
    nonce: number;
    vaultAddress?: string | null;
  },
): Promise<HLSignature> {
  const envelope = [
    lowerAddress(params.multiSigUser, "multiSigUser"),
    lowerAddress(params.outerSigner, "outerSigner"),
    params.action,
  ] as const;

  return signL1Action({
    signer: params.signer,
    action: envelope,
    nonce: params.nonce,
    isTestnet: params.network !== "mainnet",
    vaultAddress: params.vaultAddress ?? null,
  });
}

/**
 * One authorised user's signature over a user-signed action, such as
 * `approveAgent` or `userSetAbstraction`.
 *
 * Ordinary typed data on a real chain id, so a browser wallet or a custodian
 * can produce it and the founders never need to hold a raw key.
 */
export async function signMultiSigInnerUserSignedAction(
  params: MultiSigInnerParams & {
    /** The action, already carrying `signatureChainId` and `hyperliquidChain`. */
    action: Record<string, unknown> & { signatureChainId: string };
    types: Eip712Types;
  },
): Promise<HLSignature> {
  return signUserSignedAction({
    signer: params.signer,
    action: {
      ...params.action,
      payloadMultiSigUser: lowerAddress(params.multiSigUser, "multiSigUser"),
      outerSigner: lowerAddress(params.outerSigner, "outerSigner"),
    },
    types: withMultiSigTypes(params.types),
  });
}

/**
 * Render a signature the way the exchange does when it recomputes the
 * envelope hash: `r` and `s` as minimal-length hex, with leading zeros
 * stripped.
 *
 * This matters because the inner signatures are inside the MessagePack the
 * outer hash is taken over. A standard signer zero-pads each value to 32
 * bytes, the exchange does not, and the two forms hash differently. With two
 * inner signers that is four values with a one-in-sixteen chance each of a
 * leading zero nibble, so roughly one submission in four fails, and it fails
 * as `Invalid multi-sig outer signer`, which names the wrong thing.
 *
 * Measured on testnet 19 Aug 2026: zero-padded and affected, 0 of 2 accepted;
 * minimal and affected, 6 of 6 accepted.
 */
export function minimalSignatureHex(sig: HLSignature): HLSignature {
  const strip = (hex: string): string => {
    const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
    const trimmed = raw.replace(/^0+/, "");
    return `0x${trimmed === "" ? "0" : trimmed}`;
  };
  return { r: strip(sig.r), s: strip(sig.s), v: sig.v };
}

export interface BuildMultiSigActionParams {
  multiSigUser: string;
  /** The leader, who submits. An authorised user, never the multi-sig account. */
  outerSigner: string;
  action: Record<string, unknown>;
  /** At least `threshold` inner signatures, all over the same nonce. */
  signatures: HLSignature[];
  network: HLNetwork;
}

/** Assemble the outer wrapper the leader posts. */
export function buildMultiSigAction(
  params: BuildMultiSigActionParams,
): HLMultiSigAction {
  const multiSigUser = lowerAddress(params.multiSigUser, "multiSigUser");
  const outerSigner = lowerAddress(params.outerSigner, "outerSigner");
  if (multiSigUser === outerSigner) {
    throw new DeployerError(
      "The leader cannot be the multi-sig account itself; it must be one of the authorized users",
    );
  }
  if (params.signatures.length === 0) {
    throw new DeployerError("A multi-sig action needs at least one signature");
  }
  return {
    type: "multiSig",
    signatureChainId: signatureChainId(params.network),
    /* Rendered the exchange's way, or the outer hash will not match. */
    signatures: params.signatures.map(minimalSignatureHex),
    payload: {
      multiSigUser,
      outerSigner,
      action: multiSigPayloadAction(params.action),
    },
  };
}

/**
 * Keccak-256 of the outer envelope, which is what the leader signs.
 *
 * Hashes the wrapper exactly as given. Build it with
 * {@link buildMultiSigAction}, which renders the inner signatures the way the
 * exchange does; hashing a hand-built wrapper whose signatures are zero-padded
 * produces a hash the exchange will not agree with.
 */
export function multiSigActionHash(
  action: HLMultiSigAction,
  nonce: number,
  vaultAddress: string | null = null,
): string {
  const { type: _type, ...withoutTag } = action;
  return bytesToHex(
    createL1ActionHash({
      action: withoutTag as unknown as Record<string, unknown>,
      nonce,
      vaultAddress,
    }),
  );
}

/**
 * The leader's signature over the assembled wrapper. The leader signs the
 * envelope hash, not the action, so it attests to the collected quorum rather
 * than to the action's content.
 */
export async function signMultiSigEnvelope(params: {
  signer: HIP4Signer;
  action: HLMultiSigAction;
  /** Must match the nonce every inner signature used. */
  nonce: number;
  network: HLNetwork;
  vaultAddress?: string | null;
}): Promise<HLSignature> {
  return signUserSignedAction({
    signer: params.signer,
    action: {
      signatureChainId: signatureChainId(params.network),
      hyperliquidChain: params.network === "mainnet" ? "Mainnet" : "Testnet",
      multiSigActionHash: multiSigActionHash(
        params.action,
        params.nonce,
        params.vaultAddress ?? null,
      ),
      nonce: params.nonce,
    },
    types: SEND_MULTI_SIG_TYPES,
  });
}
