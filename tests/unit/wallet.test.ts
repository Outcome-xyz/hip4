import { describe, it, expect, vi } from "vitest";
import { HIP4WalletAdapter } from "../../src/adapter/hyperliquid/wallet";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import type { HIP4Signer } from "../../src/adapter/hyperliquid/types";

// ---------------------------------------------------------------------------
// Mock client
// ---------------------------------------------------------------------------

function mockClient(testnet = true): HIP4Client {
  return {
    testnet,
    submitUserSignedAction: vi.fn().mockResolvedValue({ status: "ok" }),
    fetchSpotAssetCtx: vi.fn().mockResolvedValue({ markPx: "1.0", midPx: "0.9" }),
    placeOrder: vi.fn().mockResolvedValue({
      status: "ok",
      response: { type: "order", data: { statuses: [{ filled: { totalSz: "10.0", avgPx: "1.0", oid: 123 } }] } },
    }),
  } as unknown as HIP4Client;
}

function mockAuth(authed = true) {
  const signer = authed ? mockHIP4Signer() : null;
  return {
    getSigner: () => signer,
    initAuth: vi.fn(),
    clearAuth: vi.fn(),
    getAuthStatus: () => ({ status: authed ? "ready" : "disconnected" }),
  };
}

// ---------------------------------------------------------------------------
// Mock signers
// ---------------------------------------------------------------------------

function mockHIP4Signer(): HIP4Signer {
  return {
    getAddress: () => "0xabc",
    signTypedData: vi.fn().mockResolvedValue({
      r: "0x" + "aa".repeat(32),
      s: "0x" + "bb".repeat(32),
      v: 27,
    }),
  };
}

function mockViemSigner() {
  return {
    address: "0xdef",
    signTypedData: vi.fn().mockResolvedValue("0x" + "cc".repeat(65)),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HIP4WalletAdapter", () => {
  describe("setSigner", () => {
    it("accepts a native HIP4Signer (has getAddress)", () => {
      const client = mockClient();
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      const signer = mockHIP4Signer();
      expect(() => wallet.setSigner(signer)).not.toThrow();
    });

    it("accepts a viem-style signer (has .address string)", () => {
      const client = mockClient();
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      const signer = mockViemSigner();
      expect(() => wallet.setSigner(signer)).not.toThrow();
    });

    it("wraps viem signer to call signTypedData with object arg", async () => {
      const client = mockClient();
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      const signer = mockViemSigner();
      wallet.setSigner(signer);

      await wallet.usdClassTransfer({ amount: "10", toPerp: false });

      expect(signer.signTypedData).toHaveBeenCalledOnce();
      const callArg = (signer.signTypedData as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Viem-style: single object with domain, types, primaryType, message
      expect(callArg).toHaveProperty("domain");
      expect(callArg).toHaveProperty("types");
      expect(callArg).toHaveProperty("primaryType");
      expect(callArg).toHaveProperty("message");
      expect(callArg.primaryType).toBe("HyperliquidTransaction:UsdClassTransfer");
    });

    it("throws on invalid signer (no address, no getAddress)", () => {
      const client = mockClient();
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      expect(() => wallet.setSigner({ signTypedData: vi.fn() } as unknown as HIP4Signer)).toThrow("Invalid signer");
    });
  });

  describe("usdClassTransfer", () => {
    it("returns error when no signer set", async () => {
      const client = mockClient();
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      const res = await wallet.usdClassTransfer({ amount: "10", toPerp: false });
      expect(res.success).toBe(false);
      expect(res.error).toContain("No wallet signer");
    });

    it("sends correct action for toPerp=false (deposit to spot)", async () => {
      const client = mockClient();
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      wallet.setSigner(mockHIP4Signer());

      await wallet.usdClassTransfer({ amount: "100", toPerp: false });

      const call = (client.submitUserSignedAction as ReturnType<typeof vi.fn>).mock.calls[0];
      const action = call[0];
      expect(action.type).toBe("usdClassTransfer");
      expect(action.amount).toBe("100");
      expect(action.toPerp).toBe(false);
      expect(action.signatureChainId).toBe("0x66eee");
      expect(action.hyperliquidChain).toBe("Testnet");
    });

    it("uses Mainnet for non-testnet client", async () => {
      const client = mockClient(false);
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      wallet.setSigner(mockHIP4Signer());

      await wallet.usdClassTransfer({ amount: "10", toPerp: true });

      const action = (client.submitUserSignedAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(action.hyperliquidChain).toBe("Mainnet");
    });

    it("returns success on ok response", async () => {
      const client = mockClient();
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      wallet.setSigner(mockHIP4Signer());

      const res = await wallet.usdClassTransfer({ amount: "10", toPerp: false });
      expect(res.success).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("returns error on non-ok response", async () => {
      const client = mockClient();
      (client.submitUserSignedAction as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "err",
        response: { error: "Insufficient balance" },
      });
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      wallet.setSigner(mockHIP4Signer());

      const res = await wallet.usdClassTransfer({ amount: "10", toPerp: false });
      expect(res.success).toBe(false);
      expect(res.error).toBe("Insufficient balance");
    });
  });

  describe("withdraw", () => {
    it("sends withdraw3 action with destination and time field", async () => {
      const client = mockClient();
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      wallet.setSigner(mockHIP4Signer());

      await wallet.withdraw({ destination: "0xdead", amount: "50" });

      const action = (client.submitUserSignedAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(action.type).toBe("withdraw3");
      expect(action.destination).toBe("0xdead");
      expect(action.amount).toBe("50");
      expect(action.time).toBeTypeOf("number");
      // withdraw3 uses "time" not "nonce"
      expect(action.nonce).toBeUndefined();
    });
  });

  describe("usdSend", () => {
    it("sends usdSend action with destination and time field", async () => {
      const client = mockClient();
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      wallet.setSigner(mockHIP4Signer());

      await wallet.usdSend({ destination: "0xbeef", amount: "25" });

      const action = (client.submitUserSignedAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(action.type).toBe("usdSend");
      expect(action.destination).toBe("0xbeef");
      expect(action.amount).toBe("25");
      expect(action.time).toBeTypeOf("number");
    });
  });

  describe("error handling", () => {
    it("catches signer errors and returns them", async () => {
      const client = mockClient();
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      const signer = mockHIP4Signer();
      (signer.signTypedData as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("User rejected"));
      wallet.setSigner(signer);

      const res = await wallet.usdClassTransfer({ amount: "10", toPerp: false });
      expect(res.success).toBe(false);
      expect(res.error).toBe("User rejected");
    });

    it("handles string error response", async () => {
      const client = mockClient();
      (client.submitUserSignedAction as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "err",
        response: "Rate limited",
      });
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      wallet.setSigner(mockHIP4Signer());

      const res = await wallet.withdraw({ destination: "0x1", amount: "1" });
      expect(res.success).toBe(false);
      expect(res.error).toBe("Rate limited");
    });

    it("handles missing error details gracefully", async () => {
      const client = mockClient();
      (client.submitUserSignedAction as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "err",
      });
      const wallet = new HIP4WalletAdapter(client, mockAuth() as any);
      wallet.setSigner(mockHIP4Signer());

      const res = await wallet.usdSend({ destination: "0x1", amount: "1" });
      expect(res.success).toBe(false);
      expect(res.error).toBe("Action failed");
    });
  });

  describe("buyUsdh / sellUsdh (spot orders)", () => {
    it("fetches oracle price and uses it for buy price (oracle * 1.1)", async () => {
      const client = mockClient();
      const auth = mockAuth();
      const wallet = new HIP4WalletAdapter(client, auth as any);

      await wallet.buyUsdh("10");

      expect(client.fetchSpotAssetCtx).toHaveBeenCalledWith(1338);
      const action = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Oracle is 1.0, so buy price should be 1.0 * 1.1 = 1.1
      expect(parseFloat(action.orders[0].p)).toBeCloseTo(1.1, 4);
      expect(action.orders[0].b).toBe(true);
      expect(action.orders[0].a).toBe(11338);
      expect(action.orders[0].t.limit.tif).toBe("Ioc");
    });

    it("fetches oracle price and uses it for sell price (oracle * 0.9)", async () => {
      const client = mockClient();
      const auth = mockAuth();
      const wallet = new HIP4WalletAdapter(client, auth as any);

      await wallet.sellUsdh("10");

      const action = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Oracle is 1.0, so sell price should be 1.0 * 0.9 = 0.9
      expect(parseFloat(action.orders[0].p)).toBeCloseTo(0.9, 4);
      expect(action.orders[0].b).toBe(false);
    });

    it("returns error when oracle price is unavailable", async () => {
      const client = mockClient();
      (client.fetchSpotAssetCtx as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const auth = mockAuth();
      const wallet = new HIP4WalletAdapter(client, auth as any);

      const res = await wallet.buyUsdh("10");
      expect(res.success).toBe(false);
      expect(res.error).toContain("oracle price");
    });

    it("returns error when not authenticated", async () => {
      const client = mockClient();
      const auth = mockAuth(false);
      const wallet = new HIP4WalletAdapter(client, auth as any);

      const res = await wallet.sellUsdh("10");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Not authenticated");
    });

    it("returns filledSz and avgPx on success", async () => {
      const client = mockClient();
      const auth = mockAuth();
      const wallet = new HIP4WalletAdapter(client, auth as any);

      const res = await wallet.buyUsdh("10");
      expect(res.success).toBe(true);
      expect(res.filledSz).toBe("10.0");
      expect(res.avgPx).toBe("1.0");
    });

    it("returns order error from exchange", async () => {
      const client = mockClient();
      (client.placeOrder as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "ok",
        response: { type: "order", data: { statuses: [{ error: "Price too far from oracle" }] } },
      });
      const auth = mockAuth();
      const wallet = new HIP4WalletAdapter(client, auth as any);

      const res = await wallet.sellUsdh("10");
      expect(res.success).toBe(false);
      expect(res.error).toBe("Price too far from oracle");
    });

    it("uses different oracle values correctly", async () => {
      const client = mockClient();
      (client.fetchSpotAssetCtx as ReturnType<typeof vi.fn>).mockResolvedValue({ markPx: "2.5", midPx: "2.0" });
      const auth = mockAuth();
      const wallet = new HIP4WalletAdapter(client, auth as any);

      await wallet.buyUsdh("5");
      const action = (client.placeOrder as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Oracle 2.5 * 1.1 = 2.75
      expect(parseFloat(action.orders[0].p)).toBeCloseTo(2.75, 4);
    });
  });
});
