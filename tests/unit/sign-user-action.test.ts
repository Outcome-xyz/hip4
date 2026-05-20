import { describe, it, expect, vi } from "vitest";
import { signUserSignedAction, WITHDRAW_TYPES, USD_CLASS_TRANSFER_TYPES, USD_SEND_TYPES } from "../../src/adapter/hyperliquid/signing";
import type { HIP4Signer } from "../../src/adapter/hyperliquid/types";

function mockSigner(): HIP4Signer {
  return {
    getAddress: () => "0xabc",
    signTypedData: vi.fn().mockResolvedValue({
      r: "0x" + "aa".repeat(32),
      s: "0x" + "bb".repeat(32),
      v: 27,
    }),
  };
}

describe("signUserSignedAction", () => {
  it("passes correct domain with chainId parsed from signatureChainId hex", async () => {
    const signer = mockSigner();
    await signUserSignedAction({
      signer,
      action: {
        signatureChainId: "0x66eee",
        hyperliquidChain: "Testnet",
        amount: "100",
        toPerp: false,
        nonce: 123,
      },
      types: USD_CLASS_TRANSFER_TYPES,
    });

    const call = (signer.signTypedData as ReturnType<typeof vi.fn>).mock.calls[0];
    const domain = call[0];
    expect(domain.name).toBe("HyperliquidSignTransaction");
    expect(domain.version).toBe("1");
    expect(domain.chainId).toBe(0x66eee);
    expect(domain.verifyingContract).toBe("0x0000000000000000000000000000000000000000");
  });

  it("filters message to only include keys defined in types", async () => {
    const signer = mockSigner();
    await signUserSignedAction({
      signer,
      action: {
        type: "usdClassTransfer",
        signatureChainId: "0x66eee",
        hyperliquidChain: "Testnet",
        amount: "50",
        toPerp: true,
        nonce: 999,
        extraField: "should be dropped",
      },
      types: USD_CLASS_TRANSFER_TYPES,
    });

    const call = (signer.signTypedData as ReturnType<typeof vi.fn>).mock.calls[0];
    const message = call[2];
    // Only keys from USD_CLASS_TRANSFER_TYPES should be present
    expect(message.hyperliquidChain).toBe("Testnet");
    expect(message.amount).toBe("50");
    expect(message.toPerp).toBe(true);
    expect(message.nonce).toBe(999);
    // Filtered out
    expect(message.type).toBeUndefined();
    expect(message.signatureChainId).toBeUndefined();
    expect(message.extraField).toBeUndefined();
  });

  it("passes correct primaryType from types keys", async () => {
    const signer = mockSigner();
    await signUserSignedAction({
      signer,
      action: {
        signatureChainId: "0x66eee",
        hyperliquidChain: "Mainnet",
        destination: "0xdead",
        amount: "10",
        time: 123,
      },
      types: WITHDRAW_TYPES,
    });

    const call = (signer.signTypedData as ReturnType<typeof vi.fn>).mock.calls[0];
    const types = call[1];
    expect(Object.keys(types)[0]).toBe("HyperliquidTransaction:Withdraw");
  });

  it("throws on invalid signatureChainId", async () => {
    const signer = mockSigner();
    await expect(
      signUserSignedAction({
        signer,
        action: { signatureChainId: "garbage", hyperliquidChain: "Testnet", amount: "1", nonce: 1 },
        types: USD_CLASS_TRANSFER_TYPES,
      }),
    ).rejects.toThrow("Invalid signatureChainId");
  });

  it("throws on empty types", async () => {
    const signer = mockSigner();
    await expect(
      signUserSignedAction({
        signer,
        action: { signatureChainId: "0x66eee" },
        types: {},
      }),
    ).rejects.toThrow("EIP-712 types object is empty");
  });

  it("works with USD_SEND_TYPES (time-based nonce)", async () => {
    const signer = mockSigner();
    await signUserSignedAction({
      signer,
      action: {
        signatureChainId: "0x66eee",
        hyperliquidChain: "Mainnet",
        destination: "0xbeef",
        amount: "25",
        time: 1700000000000,
      },
      types: USD_SEND_TYPES,
    });

    const message = (signer.signTypedData as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(message.time).toBe(1700000000000);
    expect(message.destination).toBe("0xbeef");
  });

  it("returns normalized HLSignature", async () => {
    const signer = mockSigner();
    const sig = await signUserSignedAction({
      signer,
      action: { signatureChainId: "0x66eee", hyperliquidChain: "Testnet", amount: "1", nonce: 1 },
      types: USD_CLASS_TRANSFER_TYPES,
    });
    expect(sig).toHaveProperty("r");
    expect(sig).toHaveProperty("s");
    expect(sig).toHaveProperty("v");
    expect(sig.v).toBe(27);
  });
});
