// ---------------------------------------------------------------------------
// Exchange error surfacing
//
// On a rejected action (`status: "err"`) Hyperliquid returns the reason as a
// bare string in `response` (e.g. "Must deposit before performing actions",
// rate-limit messages, "Insufficient spot balance"). Several call sites used
// to swallow this as a generic "Exchange returned non-ok status", which left
// integrators unable to tell what actually went wrong. These helpers extract
// the real string and, for a couple of cryptic-but-common cases, append an
// actionable hint.
// ---------------------------------------------------------------------------

/** Pull the top-level error string out of an exchange response, if present. */
export function exchangeErrorString(res: {
  status?: string;
  response?: unknown;
}): string | null {
  if (typeof res.response === "string") return res.response;
  if (
    res.response &&
    typeof res.response === "object" &&
    !Array.isArray(res.response)
  ) {
    const err = (res.response as { error?: unknown }).error;
    if (typeof err === "string") return err;
  }
  return null;
}

/**
 * Append an actionable hint to known-but-cryptic Hyperliquid errors.
 *
 * `"Must deposit before performing actions"` is the most confusing. It does
 * NOT mean the SDK lacks unified-balance support (a unified / portfolio-margin
 * account with zero perps balance trades fine). It means HL has no activated
 * account for the signing address on the *targeted network*. In order of how
 * often it bites integrators:
 *   1. Wrong network — the adapter is on testnet while funds are on mainnet
 *      (or vice versa); the account simply doesn't exist there.
 *   2. Orders/actions sent before a successful `approveAgent`.
 *   3. A signer / chain-id mismatch where HL recovers a different, unfunded
 *      address (shown as `User: 0x…` in the raw error).
 */
export function annotateExchangeError(error: string): string {
  if (/must deposit before performing actions/i.test(error)) {
    return (
      `${error} — Hyperliquid has no activated account for the signing address ` +
      "on the targeted network. Most often this is a NETWORK mismatch: confirm " +
      "`testnet` matches where your funds are (mainnet funds need " +
      "`testnet: false`). Otherwise check that `approveAgent` succeeded first, " +
      "and that you are signing with the matching wallet. This is NOT a " +
      "unified-balance limitation."
    );
  }
  return error;
}

/**
 * Convenience: resolve the best error message for a rejected response,
 * falling back to `fallback` when HL returned no parseable string, with the
 * hint applied.
 */
export function resolveExchangeError(
  res: { status?: string; response?: unknown },
  fallback: string,
): string {
  return annotateExchangeError(exchangeErrorString(res) ?? fallback);
}
