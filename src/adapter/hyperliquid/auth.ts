// ---------------------------------------------------------------------------
// HIP-4 Auth Adapter
//
// Stores a wallet address and signer for EIP-712 order signing.
// The signer must implement HIP4Signer (getAddress + signTypedData).
// ---------------------------------------------------------------------------

import type { PredictionAuthState } from "../../types/account";
import type { PredictionAuthAdapter } from "../types";
import type { HIP4Signer } from "./types";

/** Ethers-style: has getAddress() + signTypedData() */
function isEthersSigner(val: Record<string, unknown>): boolean {
  return (
    typeof val.getAddress === "function" &&
    typeof val.signTypedData === "function"
  );
}

/** Viem-style: has .address (string) + signTypedData() */
function isViemAccount(val: Record<string, unknown>): boolean {
  return (
    typeof val.address === "string" && typeof val.signTypedData === "function"
  );
}

/** Wrap a viem PrivateKeyAccount as HIP4Signer */
function wrapViemAccount(account: Record<string, unknown>): HIP4Signer {
  return {
    getAddress: () => account.address as string,
    signTypedData: (domain, types, value) =>
      (account.signTypedData as (...args: unknown[]) => Promise<string>)({
        domain,
        types: { ...types },
        primaryType: Object.keys(types)[0],
        message: value,
      }),
  };
}

export class HIP4Auth implements PredictionAuthAdapter {
  private state: PredictionAuthState = { status: "disconnected" };
  private signer: HIP4Signer | null = null;

  async initAuth(
    walletAddress: string,
    signer: unknown,
  ): Promise<PredictionAuthState> {
    if (typeof signer !== "object" || signer === null) {
      this.state = { status: "disconnected" };
      throw new Error(
        "HIP-4 auth requires a signer. Pass a viem PrivateKeyAccount, ethers Wallet, or compatible signer.",
      );
    }

    const obj = signer as Record<string, unknown>;
    let resolved: HIP4Signer;

    if (isEthersSigner(obj)) {
      // Ethers Wallet / Signer - already matches HIP4Signer interface
      resolved = signer as HIP4Signer;
    } else if (isViemAccount(obj)) {
      // Viem PrivateKeyAccount - wrap to match HIP4Signer interface
      resolved = wrapViemAccount(obj);
    } else {
      this.state = { status: "disconnected" };
      throw new Error(
        "HIP-4 auth requires a signer with signTypedData(). " +
          "Pass a viem PrivateKeyAccount, ethers Wallet, or compatible signer.",
      );
    }

    this.state = { status: "pending_approval", address: walletAddress };
    this.signer = resolved;

    // Note: We intentionally do NOT compare signer.getAddress() to walletAddress.
    // With agent wallets (e.g. HL API wallets), the signer address differs from
    // the user's wallet address by design - the agent signs on behalf of the user.

    this.state = {
      status: "ready",
      address: walletAddress,
    };

    return this.state;
  }

  getAuthStatus(): PredictionAuthState {
    return this.state;
  }

  clearAuth(): void {
    this.signer = null;
    this.state = { status: "disconnected" };
  }

  /** Internal - used by the trading adapter to get the active signer */
  getSigner(): HIP4Signer | null {
    return this.signer;
  }
}
