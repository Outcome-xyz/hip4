// ---------------------------------------------------------------------------
// Unit tests for HIP4Client infoPost retry logic
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIP4Client, HLApiError } from "../../src/adapter/hyperliquid/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(status: number, data: unknown = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText:
      status === 200
        ? "OK"
        : status === 400
          ? "Bad Request"
          : "Internal Server Error",
    json: () => Promise.resolve(data),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("infoPost retry logic", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("retries once on 500 then returns successful result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse(500))
      .mockResolvedValueOnce(
        mockFetchResponse(200, { outcomes: [], questions: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new HIP4Client();
    const promise = client.fetchOutcomeMeta();

    // Advance past the 1-second retry delay
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ outcomes: [], questions: [] });
  });

  it("does NOT retry on 400 - throws HLApiError immediately", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(400));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HIP4Client();

    // 400 should not retry - only 1 fetch call per invocation
    await expect(client.fetchAllMids()).rejects.toThrow(HLApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify the error carries status 400
    fetchMock.mockClear();
    try {
      await client.fetchAllMids();
    } catch (err) {
      expect(err).toBeInstanceOf(HLApiError);
      expect((err as HLApiError).status).toBe(400);
    }
  });

  it("propagates error when both attempts return 500", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HIP4Client();

    // Attach the rejection handler before advancing timers so the rejection
    // is never "unhandled" from Node's perspective.
    const promise = client.fetchOutcomeMeta().catch((err: unknown) => err);

    // Advance past the retry delay so the second attempt fires
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(result).toBeInstanceOf(HLApiError);
    expect((result as HLApiError).message).toContain(
      "HL info API responded with 500",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on network error (TypeError)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        mockFetchResponse(200, { outcomes: [], questions: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new HIP4Client();
    const promise = client.fetchOutcomeMeta();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ outcomes: [], questions: [] });
  });

  it("waits ~1 second between initial failure and retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse(500))
      .mockResolvedValueOnce(mockFetchResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HIP4Client();
    const promise = client.fetchAllMids();

    // Let microtasks settle so the first fetch resolves
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After 999ms, the retry should NOT have fired yet
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After 1ms more (total 1000ms), the retry fires
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await promise;
  });
});
