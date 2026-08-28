import { describe, expect, it } from "vitest";
import {
  bytesToHex,
  createL1ActionHash,
} from "../../src/adapter/hyperliquid/signing";
import type { HIP4Signer, HLSignature } from "../../src/adapter/hyperliquid/types";
import { vi } from "vitest";
import {
  buildActivateDeployerAction,
  buildApproveAgentAction,
  buildCDepositAction,
  buildConvertToMultiSigUserAction,
  buildCWithdrawAction,
  buildDeactivateDeployerAction,
  buildRegisterAndAssociateNamedOutcomeAction,
  buildRegisterQuestionAction,
  buildRegisterStandaloneOutcomeAction,
  buildSetSubDeployersAction,
  buildSettleOutcomeAction,
  buildSettleQuestionAction,
  buildTokenDelegateAction,
  buildUserSetAbstractionAction,
} from "../../src/deployer/actions";
import {
  buildMultiSigAction,
  multiSigActionHash,
  multiSigPayloadAction,
  signMultiSigInnerL1Action,
  signMultiSigInnerUserSignedAction,
} from "../../src/deployer/multisig";
import {
  APPROVE_AGENT_TYPES,
  CONVERT_TO_MULTI_SIG_USER_TYPES,
  C_DEPOSIT_TYPES,
  C_WITHDRAW_TYPES,
  TOKEN_DELEGATE_TYPES,
  USER_SET_ABSTRACTION_TYPES,
} from "../../src/deployer/signing-types";
import type { Eip712Types } from "../../src/deployer/signing-types";
import VECTORS from "../parity/deployer-vectors.json";

/*
 * Every builder, checked against reference vectors from the Hyperliquid
 * Python SDK. These pin the MessagePack layout and the EIP-712 struct
 * layout against the reference implementation rather than against ourselves,
 * so a drift in either encoder fails here rather than on the wire.
 *
 * Regenerate: see `note` in tests/parity/deployer-vectors.json.
 */
const { master, leader, agent, validator, nonce } = VECTORS.constants;
const SIGS = VECTORS.constants.signatures as HLSignature[];
const NETWORK = "testnet" as const;

const asRecord = (a: unknown) => a as unknown as Record<string, unknown>;
const hashOf = (action: unknown) =>
  bytesToHex(createL1ActionHash({ action: asRecord(action), nonce }));

function recordingSigner(): HIP4Signer & {
  signTypedData: ReturnType<typeof vi.fn>;
} {
  return {
    getAddress: () => leader,
    signTypedData: vi.fn().mockResolvedValue(SIGS[0] as HLSignature),
  };
}

const REGISTER_STANDALONE = buildRegisterStandaloneOutcomeAction({
  venue: "zzz",
  templateId: "binaryPrice4",
  values: {
    perp: "BTC",
    priceDescription: "Bitcoin",
    seconds: "60",
    threshold: "50000",
    time: "20260901-1200",
  },
});

const REGISTER_QUESTION = buildRegisterQuestionAction({
  venue: "zzz",
  question: {
    templateId: "sportsContestResult",
    values: { participantA: "Brazil", participantB: "Spain" },
  },
  namedOutcomes: [
    { templateId: "sportsContestParticipant", values: { participant: "Brazil" } },
    { templateId: "sportsContestDraw", values: {} },
  ],
  deployerFeeScale: "1.5",
});

const SETTLE_OUTCOME = buildSettleOutcomeAction(
  "zzz",
  {
    outcome: 13065,
    name: "template:binaryPrice4",
    description: "perp:BTC|threshold:50000|time:20260901-1200",
    sideSpecs: [{ name: "template:Yes" }, { name: "template:No" }],
  },
  "1",
);

const SETTLE_QUESTION = buildSettleQuestionAction({
  venue: "zzz",
  question: {
    question: 182,
    name: "What will Hypurr eat most of?",
    description: "A food journal",
    namedOutcomes: [7003, 7004, 7005],
    settledNamedOutcomes: [],
  },
  outcomes: [7003, 7004, 7005].map((outcome) => ({
    outcome,
    name: "Chicken",
    description: "N/A",
    sideSpecs: [{ name: "Yes" }, { name: "No" }],
  })),
  winner: 7004,
});

const USER_SIGNED: Record<
  string,
  { action: Record<string, unknown> & { signatureChainId: string }; types: Eip712Types }
> = {
  approveAgent: {
    action: asRecord(
      buildApproveAgentAction({
        agentAddress: agent,
        agentName: "poc",
        nonce,
        network: NETWORK,
      }),
    ) as Record<string, unknown> & { signatureChainId: string },
    types: APPROVE_AGENT_TYPES,
  },
  convertToMultiSigUser: {
    action: asRecord(
      buildConvertToMultiSigUserAction({
        authorizedUsers: [leader, master],
        threshold: 2,
        nonce,
        network: NETWORK,
      }),
    ) as Record<string, unknown> & { signatureChainId: string },
    types: CONVERT_TO_MULTI_SIG_USER_TYPES,
  },
  userSetAbstraction: {
    action: asRecord(
      buildUserSetAbstractionAction({
        user: master,
        abstraction: "disabled",
        nonce,
        network: NETWORK,
      }),
    ) as Record<string, unknown> & { signatureChainId: string },
    types: USER_SET_ABSTRACTION_TYPES,
  },
  tokenDelegate: {
    action: asRecord(
      buildTokenDelegateAction({
        validator,
        amount: "100",
        isUndelegate: false,
        nonce,
        network: NETWORK,
      }),
    ) as Record<string, unknown> & { signatureChainId: string },
    types: TOKEN_DELEGATE_TYPES,
  },
  cDeposit: {
    action: asRecord(
      buildCDepositAction({ amount: "120.0005", nonce, network: NETWORK }),
    ) as Record<string, unknown> & { signatureChainId: string },
    types: C_DEPOSIT_TYPES,
  },
  cWithdraw: {
    action: asRecord(
      buildCWithdrawAction({ amount: "1", nonce, network: NETWORK }),
    ) as Record<string, unknown> & { signatureChainId: string },
    types: C_WITHDRAW_TYPES,
  },
};

describe("L1 action hashes match the Python SDK", () => {
  const cases: Array<[string, unknown]> = [
    ["registerStandaloneOutcome", REGISTER_STANDALONE],
    ["registerQuestion", REGISTER_QUESTION],
    [
      "registerAndAssociateNamedOutcome",
      buildRegisterAndAssociateNamedOutcomeAction({
        venue: "zzz",
        question: 182,
        namedOutcome: {
          templateId: "sportsContestParticipant",
          values: { participant: "Spain" },
        },
      }),
    ],
    [
      "setSubDeployers",
      buildSetSubDeployersAction({
        venue: "zzz",
        entries: [
          { variant: "settleOutcome", user: VECTORS.constants.agent, allowed: true },
          { variant: "settleQuestion", user: VECTORS.constants.leader, allowed: false },
        ],
      }),
    ],
    ["settleOutcome", SETTLE_OUTCOME],
    ["settleQuestion", SETTLE_QUESTION],
    ["activate", buildActivateDeployerAction("zzz")],
    ["deactivate", buildDeactivateDeployerAction()],
  ];
  for (const [name, action] of cases) {
    it(name, () => {
      expect(hashOf(action)).toBe(
        (VECTORS.l1ActionHash as Record<string, string>)[name],
      );
    });
  }
});

describe("multi-sig inner L1 envelopes match the Python SDK", () => {
  const cases: Array<[string, unknown]> = [
    ["registerStandaloneOutcome", REGISTER_STANDALONE],
    ["settleQuestion", SETTLE_QUESTION],
    ["activate", buildActivateDeployerAction("zzz")],
  ];
  for (const [name, action] of cases) {
    it(name, async () => {
      const signer = recordingSigner();
      await signMultiSigInnerL1Action({
        signer,
        multiSigUser: master,
        outerSigner: leader,
        network: NETWORK,
        nonce,
        action: asRecord(action),
      });
      const [, , message] = signer.signTypedData.mock.calls[0] as [
        unknown,
        unknown,
        { connectionId: string },
      ];
      expect(message.connectionId).toBe(
        (VECTORS.multiSigInnerL1Hash as Record<string, string>)[name],
      );
    });
  }
});

describe("multi-sig envelope hashes match the Python SDK", () => {
  function envelopeHash(action: Record<string, unknown>): string {
    return multiSigActionHash(
      buildMultiSigAction({
        multiSigUser: master,
        outerSigner: leader,
        action,
        signatures: SIGS,
        network: NETWORK,
      }),
      nonce,
    );
  }

  for (const [name, entry] of Object.entries(USER_SIGNED)) {
    it(`wrapping ${name}`, () => {
      /* userSetAbstraction is rewritten inside a payload, so it is compared
         against the shortened form the wrapper is expected to produce. */
      const key =
        name === "userSetAbstraction" ? "userSetAbstractionWire" : name;
      expect(envelopeHash(entry.action)).toBe(
        (VECTORS.multiSigEnvelopeHash as Record<string, string>)[key],
      );
    });
  }

  it("wrapping an L1 action", () => {
    expect(envelopeHash(asRecord(REGISTER_STANDALONE))).toBe(
      VECTORS.multiSigEnvelopeHash.registerStandaloneOutcome,
    );
  });

  it("shortens only userSetAbstraction, and only inside the payload", () => {
    const entry = USER_SIGNED.userSetAbstraction;
    expect(entry?.action.abstraction).toBe("disabled");
    expect(multiSigPayloadAction(entry?.action ?? {}).abstraction).toBe("i");
  });
});

describe("user-signed EIP-712 payloads match the Python SDK", () => {
  for (const [name, entry] of Object.entries(USER_SIGNED)) {
    it(name, async () => {
      const expected = (
        VECTORS.userSignedPayload as Record<
          string,
          {
            domain: Record<string, unknown>;
            types: Array<{ name: string; type: string }>;
            primaryType: string;
            message: Record<string, unknown>;
          }
        >
      )[name];
      const signer = recordingSigner();
      await signMultiSigInnerUserSignedAction({
        signer,
        multiSigUser: master,
        outerSigner: leader,
        network: NETWORK,
        action: entry.action,
        types: entry.types,
      });
      const [domain, types, message] = signer.signTypedData.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, Array<{ name: string; type: string }>>,
        Record<string, unknown>,
      ];
      expect(domain).toEqual(expected?.domain);
      expect(Object.keys(types)).toEqual([expected?.primaryType]);
      expect(types[expected?.primaryType as string]).toEqual(expected?.types);
      /* Python carries every action field in the message; the SDK filters to
         the fields the type table declares, which is what a wallet signs. */
      const declared = new Set((expected?.types ?? []).map((f) => f.name));
      const filtered = Object.fromEntries(
        Object.entries(expected?.message ?? {}).filter(([k]) => declared.has(k)),
      );
      expect(message).toEqual(filtered);
    });
  }
});
