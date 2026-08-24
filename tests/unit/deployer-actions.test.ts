import { describe, expect, it } from "vitest";
import {
  buildActivateDeployerAction,
  buildApproveAgentAction,
  buildCDepositAction,
  buildConvertToMultiSigUserAction,
  buildDeactivateDeployerAction,
  buildRegisterQuestionAction,
  buildRegisterStandaloneOutcomeAction,
  buildSettleOutcomeAction,
  buildSettleQuestionAction,
  buildUserSetAbstractionAction,
  hypeToWei,
  nextNonce,
  normalizeFeeScale,
  normalizeSettleFraction,
  sortedKeywordPairs,
  venueNameError,
} from "../../src/deployer/actions";
import { DeployerError } from "../../src/deployer/error";

const OUTCOME = {
  outcome: 13065,
  name: "template:binaryPrice4",
  description: "perp:BTC|threshold:50000|time:20260901-1200",
  sideSpecs: [{ name: "template:Yes" }, { name: "template:No" }],
};

describe("normalizers", () => {
  it("strips trailing zeros from a fee scale", () => {
    expect(normalizeFeeScale("0.50")).toBe("0.5");
    expect(normalizeFeeScale("3")).toBe("3");
    expect(normalizeFeeScale("0")).toBe("0");
  });

  it("refuses a fee scale outside 0 to 10", () => {
    expect(() => normalizeFeeScale("10.5")).toThrow(DeployerError);
  });

  it("refuses signs and exponents", () => {
    expect(() => normalizeFeeScale("-1")).toThrow(DeployerError);
    expect(() => normalizeFeeScale("1e2")).toThrow(DeployerError);
  });

  it("bounds a settle fraction to 0 through 1", () => {
    expect(normalizeSettleFraction("1")).toBe("1");
    expect(normalizeSettleFraction("0.250")).toBe("0.25");
    expect(() => normalizeSettleFraction("1.5")).toThrow(DeployerError);
  });

  it("converts HYPE to wei at 8 decimals", () => {
    expect(hypeToWei("120.0005")).toBe(12_000_050_000);
    expect(hypeToWei("100")).toBe(10_000_000_000);
    expect(hypeToWei("0")).toBe(0);
  });

  it("sorts keyword pairs lexicographically", () => {
    expect(sortedKeywordPairs({ time: "1", perp: "BTC", threshold: "5" })).toEqual([
      ["perp", "BTC"],
      ["threshold", "5"],
      ["time", "1"],
    ]);
  });

  it("hands out strictly increasing nonces", () => {
    expect(nextNonce()).toBeLessThan(nextNonce());
  });
});

describe("venue names", () => {
  it("accepts 2 to 4 lowercase letters", () => {
    expect(venueNameError("zzz")).toBeNull();
    expect(venueNameError(" AB ")).toBeNull();
  });

  it("rejects anything else", () => {
    expect(venueNameError("a")).not.toBeNull();
    expect(venueNameError("abcde")).not.toBeNull();
    expect(venueNameError("a1")).not.toBeNull();
    expect(venueNameError("")).not.toBeNull();
  });
});

describe("activation", () => {
  it("wraps the venue name in the nested activate field", () => {
    expect(buildActivateDeployerAction("ZZZ")).toEqual({
      type: "activateOutcomeDeployer",
      activate: { venueName: "zzz" },
    });
  });

  it("deactivates with the flag form", () => {
    expect(buildDeactivateDeployerAction()).toEqual({
      type: "activateOutcomeDeployer",
      isDeactivate: true,
    });
  });
});

describe("registration", () => {
  it("builds a standalone registration with sorted keywords", () => {
    const action = buildRegisterStandaloneOutcomeAction({
      templateId: "binaryPrice4",
      values: { time: "20260901-1200", perp: "BTC", threshold: "50000" },
    });
    expect(action.outcome.registerStandaloneOutcomeFromTemplate).toEqual({
      id: "binaryPrice4",
      keywordToValue: [
        ["perp", "BTC"],
        ["threshold", "50000"],
        ["time", "20260901-1200"],
      ],
      deployerFeeScale: "0",
    });
  });

  it("keeps the action key order the exchange hashes", () => {
    const action = buildRegisterStandaloneOutcomeAction({
      templateId: "binaryPrice4",
      values: { perp: "BTC" },
    });
    expect(Object.keys(action)).toEqual(["type", "outcome"]);
    expect(
      Object.keys(action.outcome.registerStandaloneOutcomeFromTemplate),
    ).toEqual(["id", "keywordToValue", "deployerFeeScale"]);
  });

  it("carries the fee scale on the question only, not its named outcomes", () => {
    const action = buildRegisterQuestionAction({
      question: { templateId: "sportsContestResult", values: { sport: "football" } },
      namedOutcomes: [
        { templateId: "sportsContestParticipant", values: { participant: "A" } },
        { templateId: "sportsContestDraw", values: {} },
      ],
      deployerFeeScale: "1.50",
    });
    const inner = action.outcome.registerQuestionFromTemplate;
    expect(inner.questionTemplateInstance.deployerFeeScale).toBe("1.5");
    expect(inner.namedOutcomeTemplateInstances[0]?.deployerFeeScale).toBeUndefined();
    expect(inner.namedOutcomeTemplateInstances.map((o) => o.id)).toEqual([
      "sportsContestParticipant",
      "sportsContestDraw",
    ]);
  });

  it("refuses a question with no named outcomes", () => {
    expect(() =>
      buildRegisterQuestionAction({
        question: { templateId: "sportsContestResult", values: {} },
        namedOutcomes: [],
      }),
    ).toThrow(DeployerError);
  });
});

describe("settlement", () => {
  it("echoes name, description and side names back verbatim", () => {
    const action = buildSettleOutcomeAction(OUTCOME, "1");
    expect(action.outcome.settleOutcome).toEqual({
      outcome: 13065,
      settleFraction: "1",
      details: "",
      nameAndDescription: [OUTCOME.name, OUTCOME.description],
      sideNames: ["template:Yes", "template:No"],
    });
    expect(Object.keys(action.outcome.settleOutcome)).toEqual([
      "outcome",
      "settleFraction",
      "details",
      "nameAndDescription",
      "sideNames",
    ]);
  });

  it("refuses an outcome that does not have exactly two sides", () => {
    expect(() =>
      buildSettleOutcomeAction({ ...OUTCOME, sideSpecs: [{ name: "Yes" }] }, "1"),
    ).toThrow(DeployerError);
  });

  it("settles a question with the winner at 1 and the rest at 0", () => {
    const outcomes = [7003, 7004, 7005].map((id) => ({ ...OUTCOME, outcome: id }));
    const action = buildSettleQuestionAction({
      question: {
        question: 182,
        name: "Q",
        description: "D",
        namedOutcomes: [7003, 7004, 7005],
        settledNamedOutcomes: [],
      },
      outcomes,
      winner: 7004,
    });
    const settlements = action.outcome.settleQuestion2.outcomeSettlements;
    expect(settlements.map((s) => [s.outcome, s.settleFraction])).toEqual([
      [7003, "0"],
      [7004, "1"],
      [7005, "0"],
    ]);
  });

  it("skips outcomes that are already settled", () => {
    const action = buildSettleQuestionAction({
      question: {
        question: 182,
        name: "Q",
        description: "D",
        namedOutcomes: [7003, 7004],
        settledNamedOutcomes: [7003],
      },
      outcomes: [{ ...OUTCOME, outcome: 7004 }],
      winner: 7004,
    });
    expect(
      action.outcome.settleQuestion2.outcomeSettlements.map((s) => s.outcome),
    ).toEqual([7004]);
  });

  it("refuses a winner that is not an unsettled named outcome", () => {
    expect(() =>
      buildSettleQuestionAction({
        question: {
          question: 182,
          name: "Q",
          description: "D",
          namedOutcomes: [7003],
          settledNamedOutcomes: [7003],
        },
        outcomes: [],
        winner: 7003,
      }),
    ).toThrow(DeployerError);
  });
});

describe("account actions", () => {
  it("lowercases the agent address, which a checksummed one silently breaks", () => {
    const action = buildApproveAgentAction({
      agentAddress: "0xAB04C8D8372D83EC939570FD2D956D0BB31AACE3",
      agentName: "poc",
      nonce: 1,
      network: "testnet",
    });
    expect(action.agentAddress).toBe(
      "0xab04c8d8372d83ec939570fd2d956d0bb31aace3",
    );
    expect(action.signatureChainId).toBe("0x66eee");
    expect(action.hyperliquidChain).toBe("Testnet");
  });

  it("defaults to the unnamed agent slot", () => {
    const action = buildApproveAgentAction({
      agentAddress: "0x" + "ab".repeat(20),
      nonce: 1,
      network: "mainnet",
    });
    expect(action.agentName).toBe("");
    expect(action.signatureChainId).toBe("0xa4b1");
  });

  it("refuses an agent address that is not an address", () => {
    expect(() =>
      buildApproveAgentAction({
        agentAddress: "not-an-address",
        nonce: 1,
        network: "testnet",
      }),
    ).toThrow(DeployerError);
  });

  it("serializes multi-sig signers as sorted lowercase JSON", () => {
    const action = buildConvertToMultiSigUserAction({
      authorizedUsers: [
        "0x61A1A8685d841b75AC821A13a443ad6b3b43D355",
        "0x251Fd19DF63a83652eeA93A6A5e451Aa5Ce81e4C",
      ],
      threshold: 2,
      nonce: 7,
      network: "testnet",
    });
    expect(JSON.parse(action.signers)).toEqual({
      authorizedUsers: [
        "0x251fd19df63a83652eea93a6a5e451aa5ce81e4c",
        "0x61a1a8685d841b75ac821a13a443ad6b3b43d355",
      ],
      threshold: 2,
    });
  });

  it("refuses a threshold above the signer count", () => {
    expect(() =>
      buildConvertToMultiSigUserAction({
        authorizedUsers: ["0x" + "11".repeat(20)],
        threshold: 2,
        nonce: 1,
        network: "testnet",
      }),
    ).toThrow(DeployerError);
  });

  it("refuses duplicate authorized users", () => {
    const dup = "0x" + "11".repeat(20);
    expect(() =>
      buildConvertToMultiSigUserAction({
        authorizedUsers: [dup, dup.toUpperCase().replace("0X", "0x")],
        threshold: 1,
        nonce: 1,
        network: "testnet",
      }),
    ).toThrow(DeployerError);
  });

  it("builds the account mode and staking actions", () => {
    expect(
      buildUserSetAbstractionAction({
        user: "0x" + "22".repeat(20),
        abstraction: "disabled",
        nonce: 3,
        network: "testnet",
      }).abstraction,
    ).toBe("disabled");
    expect(
      buildCDepositAction({ amount: "120.0005", nonce: 4, network: "testnet" }).wei,
    ).toBe(12_000_050_000);
  });
});
