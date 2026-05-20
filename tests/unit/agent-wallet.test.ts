import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAgentApprovalTypedData,
  submitAgentApproval,
} from "../../src/adapter/hyperliquid/agent-wallet";

// ---------------------------------------------------------------------------
// getAgentApprovalTypedData
// ---------------------------------------------------------------------------

describe("getAgentApprovalTypedData", () => {
  const agentAddress = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12" as `0x${string}`;
  const agentName = "test-agent";
  const nonce = 1700000000;

  it("returns correct domain", () => {
    const result = getAgentApprovalTypedData(agentAddress, agentName, nonce);
    expect(result.domain.name).toBe("HyperliquidSignTransaction");
    expect(result.domain.chainId).toBe(42161);
  });

  it("returns correct primaryType", () => {
    const result = getAgentApprovalTypedData(agentAddress, agentName, nonce);
    expect(result.primaryType).toBe("HyperliquidTransaction:ApproveAgent");
  });

  it("lowercases agent address", () => {
    const result = getAgentApprovalTypedData(agentAddress, agentName, nonce);
    expect(result.message.agentAddress).toBe(agentAddress.toLowerCase());
  });

  it("sets hyperliquidChain to Mainnet when isMainnet=true", () => {
    const result = getAgentApprovalTypedData(agentAddress, agentName, nonce, true);
    expect(result.message.hyperliquidChain).toBe("Mainnet");
  });

  it("sets hyperliquidChain to Testnet when isMainnet=false", () => {
    const result = getAgentApprovalTypedData(agentAddress, agentName, nonce, false);
    expect(result.message.hyperliquidChain).toBe("Testnet");
  });

  it("defaults to Mainnet when isMainnet is omitted", () => {
    const result = getAgentApprovalTypedData(agentAddress, agentName, nonce);
    expect(result.message.hyperliquidChain).toBe("Mainnet");
  });

  it("nonce is BigInt", () => {
    const result = getAgentApprovalTypedData(agentAddress, agentName, nonce);
    expect(typeof result.message.nonce).toBe("bigint");
    expect(result.message.nonce).toBe(BigInt(nonce));
  });
});

// ---------------------------------------------------------------------------
// submitAgentApproval
// ---------------------------------------------------------------------------

describe("submitAgentApproval", () => {
  const agentAddress = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;
  const agentName = "test-agent";
  const nonce = 1700000000;
  // 65-byte hex signature: 32 bytes r + 32 bytes s + 1 byte v
  const signature = ("0x" + "ab".repeat(32) + "cd".repeat(32) + "1b") as `0x${string}`;

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends correct payload structure to exchange URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: "ok" }),
    });
    globalThis.fetch = mockFetch;

    await submitAgentApproval(signature, agentAddress, agentName, nonce, true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.hyperliquid.xyz/exchange");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body);
    expect(body.action.type).toBe("approveAgent");
    expect(body.action.agentAddress).toBe(agentAddress.toLowerCase());
    expect(body.action.agentName).toBe(agentName);
    expect(body.nonce).toBe(nonce);
    expect(body.signature).toBeDefined();
    expect(body.signature.r).toBeDefined();
    expect(body.signature.s).toBeDefined();
    expect(body.signature.v).toBeDefined();
  });

  it('returns { success: true } on "ok" response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: "ok" }),
    });

    const result = await submitAgentApproval(signature, agentAddress, agentName, nonce);
    expect(result).toEqual({ success: true });
  });

  it("returns { success: false, error } on error response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          status: "err",
          response: { error: "Agent not allowed" },
        }),
    });

    const result = await submitAgentApproval(signature, agentAddress, agentName, nonce);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Agent not allowed");
  });

  it("uses testnet URL when isMainnet=false", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: "ok" }),
    });
    globalThis.fetch = mockFetch;

    await submitAgentApproval(signature, agentAddress, agentName, nonce, false);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.hyperliquid-testnet.xyz/exchange");
  });

  it("uses mainnet URL when isMainnet=true", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: "ok" }),
    });
    globalThis.fetch = mockFetch;

    await submitAgentApproval(signature, agentAddress, agentName, nonce, true);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.hyperliquid.xyz/exchange");
  });

  it("uses custom exchangeUrl when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: "ok" }),
    });
    globalThis.fetch = mockFetch;

    await submitAgentApproval(
      signature,
      agentAddress,
      agentName,
      nonce,
      true,
      "https://custom.api/exchange",
    );

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://custom.api/exchange");
  });

  it("returns error on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const result = await submitAgentApproval(signature, agentAddress, agentName, nonce);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
  });
});
