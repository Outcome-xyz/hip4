import { describe, expect, it, vi } from "vitest";
import {
  bytesToHex,
  createL1ActionHash,
} from "../../src/adapter/hyperliquid/signing";
import type { HIP4Signer, HLSignature } from "../../src/adapter/hyperliquid/types";
import {
  buildActivateDeployerAction,
  buildApproveAgentAction,
  buildRegisterStandaloneOutcomeAction,
} from "../../src/deployer/actions";
import { DeployerError } from "../../src/deployer/error";
import {
  buildMultiSigAction,
  minimalSignatureHex,
  multiSigActionHash,
  multiSigPayloadAction,
  signMultiSigEnvelope,
  signMultiSigInnerL1Action,
  signMultiSigInnerUserSignedAction,
  withMultiSigTypes,
} from "../../src/deployer/multisig";
import { APPROVE_AGENT_TYPES } from "../../src/deployer/signing-types";

/*
 * Reference vectors produced with the Hyperliquid Python SDK
 * (hyperliquid.utils.signing) against the accounts from the testnet
 * multi-sig deployer run. They pin the msgpack layout, not just our own
 * behaviour, so a change to either side shows up here.
 */
const MASTER = "0xa8d106881abe9a0b6ffd367788d6af91439d37f6";
const LEADER = "0x251fd19df63a83652eea93a6a5e451aa5ce81e4c";
const NONCE = 1_755_530_000_000;
const AGENT = "0xab04c8d8372d83ec939570fd2d956d0bb31aace3";

const SIGS: HLSignature[] = [
  { r: `0x${"11".repeat(32)}`, s: `0x${"22".repeat(32)}`, v: 27 },
  { r: `0x${"33".repeat(32)}`, s: `0x${"44".repeat(32)}`, v: 28 },
];

function recordingSigner(): HIP4Signer & {
  signTypedData: ReturnType<typeof vi.fn>;
} {
  return {
    getAddress: () => LEADER,
    signTypedData: vi.fn().mockResolvedValue({
      r: `0x${"aa".repeat(32)}`,
      s: `0x${"bb".repeat(32)}`,
      v: 27,
    } satisfies HLSignature),
  };
}

describe("inner L1 signatures", () => {
  it("hashes the [multiSigUser, outerSigner, action] envelope as the Python SDK does", async () => {
    const signer = recordingSigner();
    await signMultiSigInnerL1Action({
      signer,
      multiSigUser: MASTER,
      outerSigner: LEADER,
      network: "testnet",
      nonce: NONCE,
      action: buildRegisterStandaloneOutcomeAction({
        venue: "zzz",
        templateId: "binaryPrice4",
        values: { perp: "BTC", threshold: "50000", time: "20260901-1200" },
      }) as unknown as Record<string, unknown>,
    });
    const [, , message] = signer.signTypedData.mock.calls[0] as [
      unknown,
      unknown,
      { source: string; connectionId: string },
    ];
    expect(message.connectionId).toBe(
      "0x6e975a53fd869f7f24691b1ee9367ce8a1afadc09f011c6278a48beb7d0168b0",
    );
    expect(message.source).toBe("b");
  });

  it("wrapping an action changes what is signed", async () => {
    const activate = buildActivateDeployerAction("zzz");
    const bare = bytesToHex(
      createL1ActionHash({
        action: activate as unknown as Record<string, unknown>,
        nonce: NONCE,
      }),
    );
    expect(bare).toBe(
      "0xb6527b4ba1d06d7884f85a2f0c165fde59becd3bc7f8725bc0f481e3a2c7f1cd",
    );

    const signer = recordingSigner();
    await signMultiSigInnerL1Action({
      signer,
      multiSigUser: MASTER,
      outerSigner: LEADER,
      network: "testnet",
      nonce: NONCE,
      action: activate as unknown as Record<string, unknown>,
    });
    const [, , message] = signer.signTypedData.mock.calls[0] as [
      unknown,
      unknown,
      { connectionId: string },
    ];
    expect(message.connectionId).toBe(
      "0x32e4f02e2a5749f37081f1990e55fa5b576ae623adaecc89a5bc6edd453f3203",
    );
  });

  it("lowercases the addresses that go into the envelope", async () => {
    const signer = recordingSigner();
    await signMultiSigInnerL1Action({
      signer,
      multiSigUser: MASTER.toUpperCase().replace("0X", "0x"),
      outerSigner: LEADER.toUpperCase().replace("0X", "0x"),
      network: "testnet",
      nonce: NONCE,
      action: buildActivateDeployerAction("zzz") as unknown as Record<string, unknown>,
    });
    const [, , message] = signer.signTypedData.mock.calls[0] as [
      unknown,
      unknown,
      { connectionId: string },
    ];
    expect(message.connectionId).toBe(
      "0x32e4f02e2a5749f37081f1990e55fa5b576ae623adaecc89a5bc6edd453f3203",
    );
  });
});

describe("inner user-signed signatures", () => {
  it("inserts the multi-sig fields straight after hyperliquidChain", () => {
    expect(withMultiSigTypes(APPROVE_AGENT_TYPES)).toEqual({
      "HyperliquidTransaction:ApproveAgent": [
        { name: "hyperliquidChain", type: "string" },
        { name: "payloadMultiSigUser", type: "address" },
        { name: "outerSigner", type: "address" },
        { name: "agentAddress", type: "address" },
        { name: "agentName", type: "string" },
        { name: "nonce", type: "uint64" },
      ],
    });
  });

  it("refuses a type table with no hyperliquidChain to anchor on", () => {
    expect(() =>
      withMultiSigTypes({ Thing: [{ name: "nonce", type: "uint64" }] }),
    ).toThrow(DeployerError);
  });

  it("carries the multi-sig fields in the signed message", async () => {
    const signer = recordingSigner();
    await signMultiSigInnerUserSignedAction({
      signer,
      multiSigUser: MASTER,
      outerSigner: LEADER,
      network: "testnet",
      types: APPROVE_AGENT_TYPES,
      action: buildApproveAgentAction({
        agentAddress: AGENT,
        agentName: "poc",
        nonce: NONCE,
        network: "testnet",
      }) as unknown as Record<string, unknown> & { signatureChainId: string },
    });
    const [domain, , message] = signer.signTypedData.mock.calls[0] as [
      { chainId: number; name: string },
      unknown,
      Record<string, unknown>,
    ];
    /* A real chain id, which is why a browser wallet can produce this one. */
    expect(domain).toMatchObject({ name: "HyperliquidSignTransaction", chainId: 421614 });
    expect(message).toEqual({
      hyperliquidChain: "Testnet",
      payloadMultiSigUser: MASTER,
      outerSigner: LEADER,
      agentAddress: AGENT,
      agentName: "poc",
      nonce: NONCE,
    });
  });
});

describe("the outer wrapper", () => {
  const approve = buildApproveAgentAction({
    agentAddress: AGENT,
    agentName: "poc",
    nonce: NONCE,
    network: "testnet",
  }) as unknown as Record<string, unknown>;

  it("assembles the payload the exchange expects", () => {
    expect(
      buildMultiSigAction({
        multiSigUser: MASTER,
        outerSigner: LEADER,
        action: approve,
        signatures: SIGS,
        network: "testnet",
      }),
    ).toEqual({
      type: "multiSig",
      signatureChainId: "0x66eee",
      signatures: SIGS,
      payload: { multiSigUser: MASTER, outerSigner: LEADER, action: approve },
    });
  });

  it("refuses the multi-sig account as its own leader", () => {
    expect(() =>
      buildMultiSigAction({
        multiSigUser: MASTER,
        outerSigner: MASTER,
        action: approve,
        signatures: SIGS,
        network: "testnet",
      }),
    ).toThrow(DeployerError);
  });

  it("refuses an empty signature set", () => {
    expect(() =>
      buildMultiSigAction({
        multiSigUser: MASTER,
        outerSigner: LEADER,
        action: approve,
        signatures: [],
        network: "testnet",
      }),
    ).toThrow(DeployerError);
  });

  it("hashes the envelope as the Python SDK does", () => {
    const wrapper = buildMultiSigAction({
      multiSigUser: MASTER,
      outerSigner: LEADER,
      action: approve,
      signatures: SIGS,
      network: "testnet",
    });
    expect(multiSigActionHash(wrapper, NONCE)).toBe(
      "0x97a2ab3b446c2139391611971883db8c0010e696ea963cba2693b24acc41bac4",
    );
  });

  it("has the leader sign the envelope hash, not the action", async () => {
    const signer = recordingSigner();
    const wrapper = buildMultiSigAction({
      multiSigUser: MASTER,
      outerSigner: LEADER,
      action: approve,
      signatures: SIGS,
      network: "testnet",
    });
    await signMultiSigEnvelope({
      signer,
      action: wrapper,
      nonce: NONCE,
      network: "testnet",
    });
    const [, types, message] = signer.signTypedData.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(Object.keys(types)).toEqual(["HyperliquidTransaction:SendMultiSig"]);
    expect(message).toEqual({
      hyperliquidChain: "Testnet",
      multiSigActionHash:
        "0x97a2ab3b446c2139391611971883db8c0010e696ea963cba2693b24acc41bac4",
      nonce: NONCE,
    });
  });

  it("renders r and s the way the exchange does, with leading zeros stripped", () => {
    /* The exchange rewrites r and s to minimal-length hex before hashing the
       envelope. A zero-padded value hashes differently and the submission is
       refused as "Invalid multi-sig outer signer", which names the wrong
       thing. Measured on testnet: with two inner signers this hits roughly
       one submission in four. */
    expect(
      minimalSignatureHex({
        r: `0x00${"11".repeat(31)}`,
        s: `0x0${"2".repeat(63)}`,
        v: 27,
      }),
    ).toEqual({
      r: `0x${"11".repeat(31)}`,
      s: `0x${"2".repeat(63)}`,
      v: 27,
    });
  });

  it("leaves a signature with no leading zeros untouched", () => {
    const sig = SIGS[0] as HLSignature;
    expect(minimalSignatureHex(sig)).toEqual(sig);
  });

  it("keeps a single zero rather than emitting an empty value", () => {
    expect(minimalSignatureHex({ r: `0x${"0".repeat(64)}`, s: "0x0", v: 27 })).toEqual({
      r: "0x0",
      s: "0x0",
      v: 27,
    });
  });

  it("normalizes the signatures it puts in the wrapper", () => {
    const padded: HLSignature = {
      r: `0x00${"ab".repeat(31)}`,
      s: `0x${"cd".repeat(32)}`,
      v: 28,
    };
    const wrapper = buildMultiSigAction({
      multiSigUser: MASTER,
      outerSigner: LEADER,
      action: approve,
      signatures: [padded],
      network: "testnet",
    });
    expect(wrapper.signatures[0]?.r).toBe(`0x${"ab".repeat(31)}`);
    expect(wrapper.signatures[0]?.s).toBe(padded.s);
    /* The hash follows the wrapper, so it is taken over the normalized form. */
    expect(multiSigActionHash(wrapper, NONCE)).toBe(
      multiSigActionHash(
        buildMultiSigAction({
          multiSigUser: MASTER,
          outerSigner: LEADER,
          action: approve,
          signatures: [minimalSignatureHex(padded)],
          network: "testnet",
        }),
        NONCE,
      ),
    );
  });

  it("shortens the abstraction mode inside a payload, and leaves the rest alone", () => {
    expect(
      multiSigPayloadAction({
        type: "userSetAbstraction",
        user: MASTER,
        abstraction: "disabled",
        nonce: NONCE,
      }),
    ).toMatchObject({ abstraction: "i" });
    expect(multiSigPayloadAction(approve)).toBe(approve);
  });
});
