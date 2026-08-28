import { describe, expect, it } from "vitest";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import { HIP4DeployerAdapter } from "../../src/deployer/deployer";
import { DeployerError } from "../../src/deployer/error";
import { createMockClient } from "../helpers/mock-client";
import { createValidSigner, VALID_SIGNATURE } from "../helpers/mock-signer";

const MASTER = "0xa8d106881abe9a0b6ffd367788d6af91439d37f6";
const LEADER = "0x251fd19df63a83652eea93a6a5e451aa5ce81e4c";

const META = {
  outcomes: [
    {
      outcome: 13065,
      name: "template:binaryPrice4",
      description: "perp:BTC|threshold:50000|time:20260901-1200",
      sideSpecs: [{ name: "template:Yes" }, { name: "template:No" }],
      venue: "zzz",
    },
    {
      outcome: 7004,
      name: "Chicken",
      description: "N/A",
      sideSpecs: [{ name: "Yes" }, { name: "No" }],
      venue: "zzz",
    },
  ],
  questions: [
    {
      question: 182,
      name: "What will Hypurr eat most of?",
      description: "A food journal",
      fallbackOutcome: 7002,
      namedOutcomes: [7004],
      settledNamedOutcomes: [],
    },
  ],
  deployers: [{ deployer: MASTER, venue: "zzz" }],
};

function setup() {
  const client = createMockClient();
  client.fetchOutcomeMeta.mockResolvedValue(META);
  const deployer = new HIP4DeployerAdapter(client as unknown as HIP4Client);
  const signer = createValidSigner();
  deployer.setSigner(signer);
  return { client, deployer, signer };
}

describe("signer", () => {
  it("refuses to submit without one", async () => {
    const client = createMockClient();
    const deployer = new HIP4DeployerAdapter(client as unknown as HIP4Client);
    await expect(deployer.activate("zzz")).rejects.toThrow(DeployerError);
  });

  it("takes its network from the client", () => {
    const client = createMockClient();
    expect(new HIP4DeployerAdapter(client as unknown as HIP4Client).network).toBe(
      "testnet",
    );
  });
});

describe("L1 submission", () => {
  it("signs, submits and reports the nonce and action hash", async () => {
    const { client, deployer } = setup();
    const result = await deployer.activate("zzz");
    expect(result.success).toBe(true);
    expect(result.actionHash).toMatch(/^0x[0-9a-f]{64}$/);
    const [action, nonce, signature] = client.submitAction.mock.calls[0] as [
      Record<string, unknown>,
      number,
      unknown,
    ];
    expect(action).toEqual({
      type: "activateOutcomeDeployer",
      activate: { venueName: "zzz" },
    });
    expect(nonce).toBe(result.nonce);
    expect(signature).toEqual(VALID_SIGNATURE);
  });

  it("reads the exchange's refusal", async () => {
    const { client, deployer } = setup();
    client.submitAction.mockResolvedValue({
      status: "err",
      response: "Multi-sig required",
    });
    const result = await deployer.activate("zzz");
    expect(result).toMatchObject({ success: false, error: "Multi-sig required" });
  });

  it("catches a per-item error hiding under an ok status", async () => {
    const { client, deployer } = setup();
    client.submitAction.mockResolvedValue({
      status: "ok",
      response: { data: { statuses: [{ error: "incorrect deployer" }] } },
    });
    const result = await deployer.registerStandaloneOutcome({
      venue: "zzz",
      templateId: "binaryPrice4",
      values: { perp: "BTC" },
    });
    expect(result).toMatchObject({ success: false, error: "incorrect deployer" });
  });

  it("says what a does-not-exist error actually means", async () => {
    const { client, deployer } = setup();
    client.submitAction.mockResolvedValue({
      status: "err",
      response: "User or API Wallet 0xdead does not exist",
    });
    const result = await deployer.activate("zzz");
    expect(result.error).toMatch(/recovered from the signature/);
  });

  it("returns a failure rather than throwing when the signer rejects", async () => {
    const { client, deployer } = setup();
    const signer = createValidSigner();
    signer.signTypedData.mockRejectedValue(new Error("User rejected"));
    deployer.setSigner(signer);
    const result = await deployer.activate("zzz");
    expect(result).toMatchObject({ success: false, error: "User rejected" });
    expect(client.submitAction).not.toHaveBeenCalled();
  });
});

describe("settlement by id", () => {
  it("reads the outcome back and echoes its fields", async () => {
    const { client, deployer } = setup();
    await deployer.settleOutcome({ outcomeId: 13065, settleFraction: "1" });
    const [action] = client.submitAction.mock.calls[0] as [
      { type: string; venue: string; operation: { settleOutcome: Record<string, unknown> } },
    ];
    expect(action.type).toBe("outcomeDeploy");
    expect(action.venue).toBe("zzz");
    expect(action.operation.settleOutcome).toEqual({
      outcome: 13065,
      settleFraction: "1",
      details: "",
      nameAndDescription: [
        "template:binaryPrice4",
        "perp:BTC|threshold:50000|time:20260901-1200",
      ],
      sideNames: ["template:Yes", "template:No"],
    });
  });

  it("says so when the outcome has already been pruned", async () => {
    const { deployer } = setup();
    await expect(
      deployer.settleOutcome({ outcomeId: 999, settleFraction: "1" }),
    ).rejects.toThrow(/pruned/);
  });

  it("settles a question from its live named outcomes", async () => {
    const { client, deployer } = setup();
    await deployer.settleQuestion({ questionId: 182, winner: 7004 });
    const [action] = client.submitAction.mock.calls[0] as [
      { venue: string; operation: { settleQuestion2: { outcomeSettlements: Array<{ outcome: number }> } } },
    ];
    expect(action.venue).toBe("zzz");
    expect(
      action.operation.settleQuestion2.outcomeSettlements.map((s) => s.outcome),
    ).toEqual([7004]);
  });
});

describe("user-signed submission", () => {
  it("approves an agent with a lowercased address", async () => {
    const { client, deployer } = setup();
    const result = await deployer.approveAgent({
      agentAddress: "0xAB04C8D8372D83EC939570FD2D956D0BB31AACE3",
      agentName: "poc",
    });
    expect(result.success).toBe(true);
    const [action] = client.submitUserSignedAction.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(action).toMatchObject({
      type: "approveAgent",
      agentAddress: "0xab04c8d8372d83ec939570fd2d956d0bb31aace3",
      hyperliquidChain: "Testnet",
    });
  });

  it("reports a build failure without reaching the network", async () => {
    const { client, deployer } = setup();
    await expect(
      deployer.approveAgent({ agentAddress: "nope" }),
    ).rejects.toThrow(DeployerError);
    expect(client.submitUserSignedAction).not.toHaveBeenCalled();
  });
});

describe("multi-sig submission", () => {
  it("wraps, signs the envelope and posts under the shared nonce", async () => {
    const { client, deployer } = setup();
    const nonce = 1_755_530_000_000;
    const result = await deployer.submitMultiSig({
      multiSigUser: MASTER,
      outerSigner: LEADER,
      action: { type: "activateOutcomeDeployer", activate: { venueName: "zzz" } },
      signatures: [VALID_SIGNATURE, VALID_SIGNATURE],
      nonce,
    });
    expect(result).toMatchObject({ success: true, nonce });
    const [action, posted] = client.submitUserSignedAction.mock.calls[0] as [
      { type: string; payload: { multiSigUser: string; outerSigner: string } },
      number,
    ];
    expect(action.type).toBe("multiSig");
    expect(action.payload).toMatchObject({
      multiSigUser: MASTER,
      outerSigner: LEADER,
    });
    expect(posted).toBe(nonce);
  });

  it("defaults the leader to the signer's own address", () => {
    const { deployer } = setup();
    const wrapper = deployer.buildMultiSig({
      multiSigUser: MASTER,
      outerSigner: LEADER,
      action: { type: "noop" },
      signatures: [VALID_SIGNATURE],
    });
    expect(wrapper.signatureChainId).toBe("0x66eee");
  });
});

describe("error messages", () => {
  it("does not double the full stop when the exchange already ended one", async () => {
    const { client, deployer } = setup();
    client.submitAction.mockResolvedValue({
      status: "err",
      response: "User or API Wallet 0xdead does not exist.",
    });
    const result = await deployer.activate("zzz");
    expect(result.error).not.toMatch(/\.\./);
    expect(result.error).toMatch(/exist\. That address/);
  });
});
