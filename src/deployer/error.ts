/**
 * Raised when a deployer action is malformed before it reaches the wire.
 *
 * These are all conditions the exchange would refuse, caught locally so the
 * refusal costs a correction rather than one of the day's deploys.
 * @experimental
 */
export class DeployerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployerError";
  }
}
