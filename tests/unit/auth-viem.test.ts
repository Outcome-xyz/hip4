import { describe, it, expect, vi } from "vitest";
import { HIP4Auth } from "../../src/adapter/hyperliquid/auth";

// ---------------------------------------------------------------------------
// Mock signers
// ---------------------------------------------------------------------------

function makeMockViemAccount() {
  return {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    signTypedData: vi.fn().mockResolvedValue(
      "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b",
    ),
    signMessage: vi.fn().mockResolvedValue("0x"),
    signTransaction: vi.fn().mockResolvedValue("0x"),
    source: "privateKey" as const,
    type: "local" as const,
    publicKey: "0x",
  };
}

function makeMockEthersSigner() {
  return {
    getAddress: vi.fn().mockReturnValue("0xabcdef"),
    signTypedData: vi.fn().mockResolvedValue({
      r: "0x" + "ab".repeat(32),
      s: "0x" + "cd".repeat(32),
      v: 27,
    }),
  };
}

// ---------------------------------------------------------------------------
// Viem PrivateKeyAccount
// ---------------------------------------------------------------------------

describe("HIP4Auth with viem PrivateKeyAccount", () => {
  it("initAuth succeeds with a viem account", async () => {
    const auth = new HIP4Auth();
    const account = makeMockViemAccount();
    const state = await auth.initAuth(account.address, account);

    expect(state.status).toBe("ready");
    expect(state.address).toBe(account.address);
  });

  it("getSigner returns a working HIP4Signer wrapper", async () => {
    const auth = new HIP4Auth();
    const account = makeMockViemAccount();
    await auth.initAuth(account.address, account);

    const signer = auth.getSigner();
    expect(signer).not.toBeNull();
    expect(typeof signer!.getAddress).toBe("function");
    expect(typeof signer!.signTypedData).toBe("function");
  });

  it("getSigner().getAddress() returns the viem account address", async () => {
    const auth = new HIP4Auth();
    const account = makeMockViemAccount();
    await auth.initAuth(account.address, account);

    const signer = auth.getSigner()!;
    const address = await signer.getAddress();
    expect(address).toBe(account.address);
  });

  it("getSigner().signTypedData() calls through to the viem account", async () => {
    const auth = new HIP4Auth();
    const account = makeMockViemAccount();
    await auth.initAuth(account.address, account);

    const signer = auth.getSigner()!;
    const domain = { name: "Test", chainId: 1 };
    const types = { Agent: [{ name: "source", type: "string" }] };
    const value = { source: "a" };

    await signer.signTypedData(domain, types, value);

    expect(account.signTypedData).toHaveBeenCalledWith({
      domain,
      types: { ...types },
      primaryType: "Agent",
      message: value,
    });
  });
});

// ---------------------------------------------------------------------------
// Ethers-style Signer
// ---------------------------------------------------------------------------

describe("HIP4Auth with ethers signer", () => {
  it("initAuth succeeds with an ethers signer", async () => {
    const auth = new HIP4Auth();
    const signer = makeMockEthersSigner();
    const state = await auth.initAuth("0xabcdef", signer);

    expect(state.status).toBe("ready");
  });

  it("getSigner returns the signer directly (no wrapper)", async () => {
    const auth = new HIP4Auth();
    const signer = makeMockEthersSigner();
    await auth.initAuth("0xabcdef", signer);

    // Ethers signers already match HIP4Signer, so they are passed through as-is
    const resolved = auth.getSigner();
    expect(resolved).toBe(signer);
  });
});

// ---------------------------------------------------------------------------
// Invalid signers
// ---------------------------------------------------------------------------

describe("HIP4Auth rejects invalid signers", () => {
  it("throws for a plain string (not 0x prefixed)", async () => {
    const auth = new HIP4Auth();
    await expect(auth.initAuth("0xWallet", "not-a-signer")).rejects.toThrow(
      "HIP-4 auth requires a signer",
    );
  });

  it("throws for an object with address but no signTypedData", async () => {
    const auth = new HIP4Auth();
    const partial = { address: "0x1234" };
    await expect(auth.initAuth("0xWallet", partial)).rejects.toThrow(
      "HIP-4 auth requires a signer",
    );
  });

  it("throws for a number", async () => {
    const auth = new HIP4Auth();
    await expect(auth.initAuth("0xWallet", 42)).rejects.toThrow(
      "HIP-4 auth requires a signer",
    );
  });
});
