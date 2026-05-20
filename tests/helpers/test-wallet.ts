/**
 * Deterministic test wallet utility.
 *
 * Generates a wallet from a fixed private key so tests are reproducible.
 * Uses pure JS - no external wallet library dependency.
 */

/** Deterministic private key for testing (DO NOT use in production) */
export const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/** Corresponding address for the test private key (Hardhat account #0) */
export const TEST_WALLET_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export interface TestWallet {
  privateKey: string;
  address: string;
}

/**
 * Returns a deterministic test wallet.
 * Uses Hardhat's default account #0 for compatibility with local dev tooling.
 *
 * @param index - Optional index to derive different addresses.
 *   Index 0 (default) returns the canonical Hardhat #0 account.
 *   Other indices return synthetic addresses for multi-user tests.
 */
export function createTestWallet(index = 0): TestWallet {
  if (index === 0) {
    return {
      privateKey: TEST_PRIVATE_KEY,
      address: TEST_WALLET_ADDRESS,
    };
  }

  // For non-zero indices, generate a synthetic deterministic address.
  // This is NOT cryptographically derived - it's just unique per index.
  const hexIndex = index.toString(16).padStart(4, "0");
  return {
    privateKey: `0x${"00".repeat(28)}${hexIndex.padStart(8, "0")}`,
    address: `0x${"0".repeat(36)}${hexIndex}`,
  };
}
