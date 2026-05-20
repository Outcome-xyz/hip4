import { describe, expect, it, vi } from "vitest";
import { HIP4Auth } from "../../src/adapter/hyperliquid/auth";
import type { HIP4Signer } from "../../src/adapter/hyperliquid/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockSigner(address = "0xabc123"): HIP4Signer {
  return {
    getAddress: vi.fn().mockReturnValue(address),
    signTypedData: vi.fn().mockResolvedValue({
      r: "0x" + "a".repeat(64),
      s: "0x" + "b".repeat(64),
      v: 27,
    }),
  };
}

// ---------------------------------------------------------------------------
// HIP4Auth
// ---------------------------------------------------------------------------

describe("HIP4Auth", () => {
  // -- Initial state --------------------------------------------------------

  it("starts in disconnected state", () => {
    const auth = new HIP4Auth();
    expect(auth.getAuthStatus()).toEqual({ status: "disconnected" });
  });

  it("getSigner returns null initially", () => {
    const auth = new HIP4Auth();
    expect(auth.getSigner()).toBeNull();
  });

  // -- initAuth with valid signer -------------------------------------------

  it("transitions to ready with a valid signer", async () => {
    const auth = new HIP4Auth();
    const signer = makeMockSigner();
    const state = await auth.initAuth("0xWallet", signer);

    expect(state.status).toBe("ready");
    expect(state.address).toBe("0xWallet");
  });

  it("stores the signer after initAuth", async () => {
    const auth = new HIP4Auth();
    const signer = makeMockSigner();
    await auth.initAuth("0xWallet", signer);

    expect(auth.getSigner()).toBe(signer);
  });

  // -- initAuth with invalid values -----------------------------------------

  it("throws when signer is null", async () => {
    const auth = new HIP4Auth();
    await expect(auth.initAuth("0xWallet", null)).rejects.toThrow(
      "HIP-4 auth requires a signer",
    );
  });

  it("throws when signer is a string", async () => {
    const auth = new HIP4Auth();
    await expect(auth.initAuth("0xWallet", "not-a-signer")).rejects.toThrow(
      "HIP-4 auth requires a signer",
    );
  });

  it("throws when signer has getAddress but no signTypedData", async () => {
    const auth = new HIP4Auth();
    const partial = { getAddress: vi.fn() };
    await expect(auth.initAuth("0xWallet", partial)).rejects.toThrow(
      "HIP-4 auth requires a signer",
    );
  });

  it("throws when signer has signTypedData but no getAddress", async () => {
    const auth = new HIP4Auth();
    const partial = { signTypedData: vi.fn() };
    await expect(auth.initAuth("0xWallet", partial)).rejects.toThrow(
      "HIP-4 auth requires a signer",
    );
  });

  // -- Agent wallet (signer address differs from wallet address) ------------

  it("accepts an agent wallet whose address differs from walletAddress", async () => {
    const auth = new HIP4Auth();
    const agentSigner = makeMockSigner("0xAgentAddress");
    const state = await auth.initAuth("0xUserWallet", agentSigner);

    expect(state.status).toBe("ready");
    expect(state.address).toBe("0xUserWallet");
    expect(auth.getSigner()).toBe(agentSigner);
  });

  // -- clearAuth ------------------------------------------------------------

  it("resets state to disconnected", async () => {
    const auth = new HIP4Auth();
    await auth.initAuth("0xWallet", makeMockSigner());

    auth.clearAuth();

    expect(auth.getAuthStatus()).toEqual({ status: "disconnected" });
    expect(auth.getSigner()).toBeNull();
  });

  it("is idempotent - calling clearAuth twice does not throw", () => {
    const auth = new HIP4Auth();
    auth.clearAuth();
    auth.clearAuth();

    expect(auth.getAuthStatus()).toEqual({ status: "disconnected" });
  });

  // -- getAuthStatus --------------------------------------------------------

  it("returns correct state after initAuth", async () => {
    const auth = new HIP4Auth();
    await auth.initAuth("0xAddr", makeMockSigner());

    const status = auth.getAuthStatus();
    expect(status.status).toBe("ready");
    expect(status.address).toBe("0xAddr");
  });

  it("returns disconnected after clearAuth", async () => {
    const auth = new HIP4Auth();
    await auth.initAuth("0xAddr", makeMockSigner());
    auth.clearAuth();

    expect(auth.getAuthStatus().status).toBe("disconnected");
  });
});
