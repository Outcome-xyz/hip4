// ---------------------------------------------------------------------------
// HIP-4 Wallet Operations
//
// Fund management: transfers between spot/perp, withdrawals, USD sends,
// and USDH spot buy/sell.
//
// Signing:
//   - Transfers, withdrawals, sends: EIP-712 user signing (wallet signer)
//   - USDH buy/sell: L1 agent signing (agent key via auth)
//
// Reference: @nktkas/hyperliquid -- withdraw3, usdClassTransfer, usdSend
// ---------------------------------------------------------------------------

import { applySlippage } from "../../lib/precision/financial";
import { toDecimal } from "../../lib/precision/primitives";
import type { HIP4Auth } from "./auth";
import type { HIP4Client } from "./client";
import {
  deriveCoreEvmSystemAddress,
  HYPE_CORE_EVM_SYSTEM_ADDRESS,
} from "./core-evm-system-address";
import {
  HYPE_USDC_SPOT_INDEX_MAINNET,
  HYPE_USDC_SPOT_INDEX_TESTNET,
} from "./hype-spot-mark-px";
import { formatPrice } from "./pricing";
import {
  SEND_ASSET_TYPES,
  SEND_TO_EVM_WITH_DATA_TYPES,
  signL1Action,
  signUserSignedAction,
  sortOrderAction,
  SPOT_SEND_TYPES,
  USD_CLASS_TRANSFER_TYPES,
  USD_SEND_TYPES,
  WITHDRAW_TYPES,
} from "./signing";
import type { HIP4Signer, HLOrderAction } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsdClassTransferParams {
  amount: string;
  toPerp: boolean;
}

// ---------------------------------------------------------------------------
// USDH constants
//
// Hyperliquid exposes TWO independent indices for any spot token. Do not
// conflate them:
//
//   - TOKEN index: from `info: spotMeta → tokens[].index`. Used to derive the
//     Core→EVM system address and to identify the token on the API. USDH is
//     360 on mainnet, 1452 on testnet.
//
//   - SPOT PAIR / MARKET index: from `info: spotMeta → universe[].index`.
//     Used in the `@N` spot-pair notation and `assetId = 10000 + pairIndex`
//     for CLOB orders. USDH/USDC pair is 230 on mainnet, 1338 on testnet.
//
// Passing a pair index to `deriveCoreEvmSystemAddress` sends funds to the
// wrong token. Verified live against the HL API on 2026-04-23.
// ---------------------------------------------------------------------------

// Spot-pair / market index - CLOB trading only
export const USDH_SPOT_INDEX_TESTNET = 1338;
export const USDH_SPOT_INDEX_MAINNET = 230;
export const USDH_ASSET_ID_TESTNET = 10000 + USDH_SPOT_INDEX_TESTNET;
export const USDH_ASSET_ID_MAINNET = 10000 + USDH_SPOT_INDEX_MAINNET;
export const USDH_SPOT_PAIR_TESTNET = "@1338";
export const USDH_SPOT_PAIR_MAINNET = "@230";

// Token index - Core→EVM system-address derivation + token-id string
export const USDH_TOKEN_INDEX_MAINNET = 360;
export const USDH_TOKEN_INDEX_TESTNET = 1452;
export const USDH_TOKEN_HASH_MAINNET = "0x54e00a5988577cb0b0c9ab0cb6ef7f4b";
export const USDH_TOKEN_HASH_TESTNET = "0x471fd4480bb9943a1fe080ab0d4ff36c";
export const USDH_HL_TOKEN_MAINNET = `USDH:${USDH_TOKEN_HASH_MAINNET}`;
export const USDH_HL_TOKEN_TESTNET = `USDH:${USDH_TOKEN_HASH_TESTNET}`;

// USDH ERC-20 on HyperEVM (the linked contract behind the system address).
// Funds moved via spotSend to the system address are credited here.
export const USDH_EVM_ADDRESS_MAINNET =
  "0x111111a1a0667d36bD57c0A9f569b98057111111";
export const USDH_EVM_ADDRESS_TESTNET =
  "0x22222245c52c817F95b74664Ae8546B490222222";

// Decimals are asymmetric across the Core↔EVM boundary. Core uses 8
// (weiDecimals), HyperEVM ERC-20 uses 6 (weiDecimals + evm_extra_wei_decimals,
// i.e. 8 + -2). Relevant for any downstream ERC-20 math (approve, balanceOf,
// Across quoting).
export const USDH_CORE_DECIMALS = 8;
export const USDH_EVM_DECIMALS = 6;

/** HL spot USDC token identifier. Mainnet index 0, testnet index 0.
 *  Format: `"NAME:0xHEX"` per sendToEvmWithData / spotSend spec. */
export const USDC_HL_TOKEN_MAINNET = "USDC:0x6d1e7cde53ba9467b783cb7c530ce054";
export const USDC_HL_TOKEN_TESTNET = "USDC:0xeb62eee3685fc4c43992febcd9e75443";

/** @deprecated Use network-specific variants (TESTNET/MAINNET) instead */
export const USDH_SPOT_INDEX = USDH_SPOT_INDEX_TESTNET;
/** @deprecated Use network-specific variants (TESTNET/MAINNET) instead */
export const USDH_ASSET_ID = USDH_ASSET_ID_TESTNET;
/** @deprecated Use network-specific variants (TESTNET/MAINNET) instead */
export const USDH_SPOT_PAIR = USDH_SPOT_PAIR_TESTNET;

export interface WithdrawParams {
  destination: string;
  amount: string;
}

export interface UsdSendParams {
  destination: string;
  amount: string;
}

export interface SpotSendParams {
  destination: string;
  /** Token identifier in Hyperliquid format "NAME:0xHEX" (e.g. "USDH:0x471fd4480bb9943a1fe080ab0d4ff36c"). */
  token: string;
  amount: string;
}

export interface SendAssetParams {
  destination: string;
  /** Token identifier "NAME:0xHEX". */
  token: string;
  amount: string;
  /** Source silo: `""` = perp USDC, `"spot"` = spot, or a perp DEX name. Defaults to `"spot"`. */
  sourceDex?: string;
  /** Destination silo: `""` = perp USDC / EVM system address, `"spot"` = spot, or a perp DEX name. Defaults to `""`. */
  destinationDex?: string;
  /** Sub-account to debit. Empty string = main account. */
  fromSubAccount?: string;
}

export interface SendSpotTokenToEvmParams {
  /** Token index from `info: spotMeta → tokens[].index`. NOT the spot-pair
   *  market index. Passing a pair index routes funds to the wrong token. */
  tokenIndex: number;
  /** Token identifier `"SYMBOL:0x<32-hex>"` from the same spotMeta entry. */
  tokenId: string;
  /** Decimal amount in the token's display decimals, as a string. */
  amount: string;
  /** HYPE bypasses index-derived address at `0x2222…2222`. */
  isHype?: boolean;
}

/** Validates `"SYMBOL:0x<32-hex>"` - the token-id format the HL API expects
 *  for spotSend / sendToEvmWithData. Empty symbol or wrong hex length both
 *  fail loudly here rather than landing a rejected signature on the wire. */
const SPOT_TOKEN_ID_PATTERN = /^[A-Z0-9]+:0x[0-9a-f]{32}$/;

export interface SendToEvmWithDataParams {
  /** Token identifier "NAME:0xHEX". */
  token: string;
  /** Decimal amount as a string, in the token's display decimals. */
  amount: string;
  /** Recipient on the destination chain (hex for EVM, base58 for Solana). */
  destinationRecipient: string;
  /** CCTP domain ID of the destination chain (0=Eth, 3=Arb, 6=Base, ...). */
  destinationChainId: number;
  /** Gas budget for the `coreReceiveWithData` call on HyperEVM. Empirical
   *  ceiling of the Circle `CoreDepositWallet` path is ~289k; 350k is a
   *  safe default. Under-provisioning reverts and funds land badly. */
  gasLimit: number;
  /** Hook data passed to the linked contract. "0x" = default Circle forwarder
   *  on Arbitrum. Non-magic bytes disable forwarding (user self-attests on
   *  destination, not recommended for UX). */
  data?: string;
  /** Hyperliquid perp dex name or "spot". Defaults to "spot". */
  sourceDex?: string;
  /** Recipient address encoding. Defaults to "hex". */
  addressEncoding?: "hex" | "base58";
}

export interface WalletActionResult {
  success: boolean;
  error?: string;
  filledSz?: string;
  avgPx?: string;
  /**
   * Order id of the resulting fill (set only on `success: true` for actions
   * that produce a fill - `buyUsdh`, `sellUsdh`, etc). Callers use this to
   * look up the realized fee in `userFills` / `userFillsByTime`, since the
   * synchronous order ack does not carry fee.
   */
  oid?: number;
}

// ---------------------------------------------------------------------------
// HIP4WalletAdapter
// ---------------------------------------------------------------------------

export class HIP4WalletAdapter {
  private signer: HIP4Signer | null = null;

  constructor(
    private readonly client: HIP4Client,
    private readonly auth: HIP4Auth,
  ) {}

  setSigner(
    signer:
      | HIP4Signer
      | {
          address: string;
          signTypedData: (...args: unknown[]) => Promise<string>;
        },
  ): void {
    const obj = signer as Record<string, unknown>;

    if (
      typeof obj.getAddress === "function" &&
      typeof obj.signTypedData === "function"
    ) {
      this.signer = signer as HIP4Signer;
      return;
    }

    if (
      typeof obj.address === "string" &&
      typeof obj.signTypedData === "function"
    ) {
      const addr = obj.address as string;
      const sign = obj.signTypedData as (...args: unknown[]) => Promise<string>;
      this.signer = {
        getAddress: () => addr,
        signTypedData: (domain, types, value) => {
          const primaryType = Object.keys(types)[0];
          if (!primaryType) throw new Error("EIP-712 types object is empty");
          return sign({
            domain,
            types: { ...types },
            primaryType,
            message: value,
          });
        },
      };
      return;
    }

    throw new Error(
      "Invalid signer: must have getAddress()+signTypedData() or address+signTypedData()",
    );
  }

  async buyUsdh(amount: string): Promise<WalletActionResult> {
    return this.executeSpotOrder(true, amount);
  }

  async sellUsdh(amount: string): Promise<WalletActionResult> {
    return this.executeSpotOrder(false, amount);
  }

  async sellHype(amount: string): Promise<WalletActionResult> {
    const spotIndex = this.client.testnet
      ? HYPE_USDC_SPOT_INDEX_TESTNET
      : HYPE_USDC_SPOT_INDEX_MAINNET;
    // HYPE szDecimals=2 — HL rejects sizes with more than 2 decimal places.
    const sz = Number(amount).toFixed(2);
    return this.executeSpotOrder(false, sz, spotIndex);
  }

  async transferToSpot(amount: string): Promise<WalletActionResult> {
    return this.usdClassTransfer({ amount, toPerp: false });
  }

  async transferToPerps(amount: string): Promise<WalletActionResult> {
    return this.usdClassTransfer({ amount, toPerp: true });
  }

  async usdClassTransfer(
    params: UsdClassTransferParams,
  ): Promise<WalletActionResult> {
    return this.executeUserSigned(
      "usdClassTransfer",
      { amount: params.amount, toPerp: params.toPerp },
      USD_CLASS_TRANSFER_TYPES,
      "nonce",
    );
  }

  async withdraw(params: WithdrawParams): Promise<WalletActionResult> {
    return this.executeUserSigned(
      "withdraw3",
      { destination: params.destination, amount: params.amount },
      WITHDRAW_TYPES,
      "time",
    );
  }

  async usdSend(params: UsdSendParams): Promise<WalletActionResult> {
    return this.executeUserSigned(
      "usdSend",
      { destination: params.destination, amount: params.amount },
      USD_SEND_TYPES,
      "time",
    );
  }

  async spotSend(params: SpotSendParams): Promise<WalletActionResult> {
    return this.executeUserSigned(
      "spotSend",
      {
        destination: params.destination,
        token: params.token,
        amount: params.amount,
      },
      SPOT_SEND_TYPES,
      "time",
    );
  }

  /**
   * Unified-account-compatible transfer primitive. Supersedes `spotSend`,
   * `usdSend`, `usdClassTransfer`, and `subAccountSpotTransfer` when the
   * account is in `unifiedAccount` or `portfolioMargin` abstraction mode
   * (where silo-specific actions return "Action disabled when unified
   * account is active").
   *
   * Use cases:
   *   - User → user spot transfer: `sourceDex: "spot", destinationDex: "spot"`
   *   - Core → HyperEVM bridge: `destination = systemAddress`, both dex = `""`
   *   - Spot → perp silo move: `sourceDex: "spot", destinationDex: ""`
   */
  async sendAsset(params: SendAssetParams): Promise<WalletActionResult> {
    return this.executeUserSigned(
      "sendAsset",
      {
        destination: params.destination,
        sourceDex: params.sourceDex ?? "spot",
        destinationDex: params.destinationDex ?? "",
        token: params.token,
        amount: params.amount,
        fromSubAccount: params.fromSubAccount ?? "",
      },
      SEND_ASSET_TYPES,
      "nonce",
    );
  }

  /**
   * Move a spot token from HyperCore to HyperEVM.
   *
   * Mechanism: `sendAsset` to the token's system address, with
   * `sourceDex = "spot"` and `destinationDex = ""`. HL credits the sender's
   * HyperEVM address by calling `transfer(sender, amount)` on the token's
   * linked ERC-20 contract. No hook data, no CCTP - the token stays as the
   * same token on HyperEVM.
   *
   * Why `sendAsset` and not `spotSend`: `spotSend` is rejected under
   * `unifiedAccount` / `portfolioMargin` abstraction modes with "Action
   * disabled when unified account is active". Unified is the app default
   * for new accounts, so `sendAsset` is the only flow that works for both
   * modes.
   *
   * Use this for USDH (and any non-USDC spot token). For USDC destinations
   * on other EVM chains, use `sendUsdcToEvm` instead (CCTP is strictly
   * cheaper + faster than sendAsset-to-HyperEVM + bridge).
   *
   * HYPE is the documented exception: callers must set `isHype: true` so
   * the destination resolves to the hardcoded `0x2222…2222` slot rather
   * than the index-derived address.
   */
  async sendSpotTokenToEvm(
    params: SendSpotTokenToEvmParams,
  ): Promise<WalletActionResult> {
    if (!SPOT_TOKEN_ID_PATTERN.test(params.tokenId)) {
      return {
        success: false,
        error: `Invalid token id ${params.tokenId}: expected "SYMBOL:0x<32-hex>"`,
      };
    }
    let destination: string;
    try {
      destination = params.isHype
        ? HYPE_CORE_EVM_SYSTEM_ADDRESS
        : deriveCoreEvmSystemAddress(params.tokenIndex);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Invalid token index",
      };
    }
    // Core→EVM system-address transfers normalize to sourceDex="spot" +
    // destinationDex="spot" on HL's side (confirmed via ledger inspection
    // on testnet). destinationDex="" routes to the perp USDC silo instead,
    // which rejects with "Invalid token" because that silo doesn't hold
    // USDH / arbitrary spot tokens.
    return this.sendAsset({
      destination,
      token: params.tokenId,
      amount: params.amount,
      sourceDex: "spot",
      destinationDex: "spot",
    });
  }

  /**
   * Transfer a spot token from HyperCore to the EVM side, invoking the
   * linked contract's `coreReceiveWithData` hook with user-provided data.
   *
   * For Circle-managed tokens (USDC), this bridges via CCTP directly to
   * `destinationChainId` - `destinationRecipient` receives USDC there. No
   * secondary `withdraw3` or Across hop needed to land on Arbitrum.
   *
   * Fee model: HyperEVM gas (`gasLimit × baseFee × HYPE/USDC_oracle`,
   * deducted from L1 USDC) + Circle forwarder fee on destination (0.2 USDC
   * flat, subtracted from amount). CCTP protocol fee is 0.
   */
  async sendToEvmWithData(
    params: SendToEvmWithDataParams,
  ): Promise<WalletActionResult> {
    return this.executeUserSigned(
      "sendToEvmWithData",
      {
        token: params.token,
        amount: params.amount,
        sourceDex: params.sourceDex ?? "spot",
        destinationRecipient: params.destinationRecipient,
        addressEncoding: params.addressEncoding ?? "hex",
        destinationChainId: params.destinationChainId,
        gasLimit: params.gasLimit,
        data: params.data ?? "0x",
      },
      SEND_TO_EVM_WITH_DATA_TYPES,
      "nonce",
    );
  }

  /**
   * Convenience wrapper: `sendToEvmWithData` with the USDC token string
   * for the current network auto-filled. Circle's CoreDepositWallet picks
   * up the call and CCTPs USDC to `destinationChainId`.
   */
  async sendUsdcToEvm(
    params: Omit<SendToEvmWithDataParams, "token">,
  ): Promise<WalletActionResult> {
    const token = this.client.testnet
      ? USDC_HL_TOKEN_TESTNET
      : USDC_HL_TOKEN_MAINNET;
    return this.sendToEvmWithData({ ...params, token });
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async executeSpotOrder(
    isBuy: boolean,
    amount: string,
    spotIndex?: number,
  ): Promise<WalletActionResult> {
    const agentSigner = this.auth.getSigner();
    if (!agentSigner) {
      return {
        success: false,
        error: "Not authenticated. Call auth.initAuth() first.",
      };
    }

    try {
      const resolvedSpotIndex =
        spotIndex ??
        (this.client.testnet
          ? USDH_SPOT_INDEX_TESTNET
          : USDH_SPOT_INDEX_MAINNET);
      const assetId = 10000 + resolvedSpotIndex;

      const ctx = await this.client.fetchSpotAssetCtx(resolvedSpotIndex);
      const oracle = ctx ? toDecimal(ctx.markPx) : null;
      if (!oracle || oracle.lte(0)) {
        return { success: false, error: "Could not fetch USDH oracle price" };
      }

      // HL strips trailing zeros before msgpack hashing - sending "1.10000"
      // when the server hashes "1.1" produces a signer mismatch that surfaces
      // as "Price must be divisible by tick size". formatPrice rounds to the
      // pair's tick AND strips trailing zeros, matching the path used for
      // outcome trading orders. Do NOT use raw `fixed(..., 5)` here.
      const slipped = applySlippage(ctx!.markPx, "0.1", isBuy ? "buy" : "sell");
      const price = formatPrice(Number(slipped));

      const action: HLOrderAction = {
        type: "order",
        orders: [
          {
            a: assetId,
            b: isBuy,
            p: price,
            s: amount,
            r: false,
            t: { limit: { tif: "Ioc" } },
          },
        ],
        grouping: "na",
      };

      const sortedAction = sortOrderAction(action);
      const nonce = Date.now();
      const signature = await signL1Action({
        signer: agentSigner,
        action: sortedAction,
        nonce,
        isTestnet: this.client.testnet,
      });

      const res = await this.client.placeOrder(
        sortedAction,
        nonce,
        signature,
        null,
      );
      if (res.status !== "ok" || !res.response) {
        return { success: false, error: "Exchange returned non-ok status" };
      }

      const firstStatus = res.response.data.statuses[0];
      if (!firstStatus) {
        return { success: false, error: "No order status returned" };
      }
      if ("error" in firstStatus) {
        return { success: false, error: firstStatus.error };
      }

      const filled =
        "filled" in firstStatus
          ? (
              firstStatus as {
                filled: { totalSz: string; avgPx: string; oid: number };
              }
            ).filled
          : undefined;
      return {
        success: true,
        filledSz: filled?.totalSz,
        avgPx: filled?.avgPx,
        oid: filled?.oid,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  /**
   * Set a referral code on Hyperliquid.
   * Uses L1 agent signing (requires auth to be initialized).
   */
  async setReferrer(code: string): Promise<WalletActionResult> {
    const signer = this.auth.getSigner();
    if (!signer) {
      return {
        success: false,
        error: "Not authenticated. Call auth.initAuth() first.",
      };
    }

    try {
      const nonce = Date.now();
      const action = { type: "setReferrer" as const, code };

      const signature = await signL1Action({
        signer,
        action,
        nonce,
        isTestnet: this.client.testnet,
      });

      const res = await this.client.submitUserSignedAction(
        action as unknown as Record<string, unknown>,
        nonce,
        signature,
      );

      if (res.status === "ok") {
        return { success: true };
      }

      let errorMsg = "Failed to set referrer";
      if (typeof res.response === "string") {
        errorMsg = res.response;
      } else if (
        res.response &&
        typeof res.response === "object" &&
        !Array.isArray(res.response)
      ) {
        const obj = res.response as Record<string, unknown>;
        if (typeof obj.error === "string") errorMsg = obj.error;
      }
      return { success: false, error: errorMsg };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  /**
   * Switch the master account's abstraction mode via the approved agent key.
   * "u" = unifiedAccount — merges spot and perps into a single balance.
   * Only callable after the agent has been approved (auth.initAuth() done).
   */
  async agentSetAbstraction(
    abstraction: "u" | "p" | "i",
  ): Promise<WalletActionResult> {
    const signer = this.auth.getSigner();
    if (!signer) {
      return {
        success: false,
        error: "Not authenticated. Call auth.initAuth() first.",
      };
    }

    try {
      const nonce = Date.now();
      const action = { type: "agentSetAbstraction" as const, abstraction };

      const signature = await signL1Action({
        signer,
        action,
        nonce,
        isTestnet: this.client.testnet,
      });

      const res = await this.client.submitUserSignedAction(
        action as unknown as Record<string, unknown>,
        nonce,
        signature,
      );

      if (res.status === "ok") return { success: true };

      const errorMsg =
        typeof res.response === "string"
          ? res.response
          : "Failed to set abstraction";
      return { success: false, error: errorMsg };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  private async executeUserSigned(
    type: string,
    fields: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    nonceFieldName: "nonce" | "time",
  ): Promise<WalletActionResult> {
    if (!this.signer) {
      return {
        success: false,
        error: "No wallet signer set. Call wallet.setSigner() first.",
      };
    }

    try {
      const nonce = Date.now();

      const action: Record<string, unknown> & { signatureChainId: string } = {
        type,
        signatureChainId: this.client.testnet ? "0x66eee" : "0xa4b1",
        hyperliquidChain: this.client.testnet ? "Testnet" : "Mainnet",
        ...fields,
        [nonceFieldName]: nonce,
      };

      const signature = await signUserSignedAction({
        signer: this.signer,
        action,
        types,
      });

      const res = await this.client.submitUserSignedAction(
        action,
        nonce,
        signature,
      );

      if (res.status === "ok") {
        return { success: true };
      }

      let errorMsg = "Action failed";
      if (typeof res.response === "string") {
        errorMsg = res.response;
      } else if (
        res.response &&
        typeof res.response === "object" &&
        !Array.isArray(res.response)
      ) {
        const obj = res.response as Record<string, unknown>;
        if (typeof obj.error === "string") errorMsg = obj.error;
      }
      return { success: false, error: errorMsg };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: message };
    }
  }
}
