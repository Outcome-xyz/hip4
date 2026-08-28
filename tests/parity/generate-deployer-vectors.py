#!/usr/bin/env python3
"""Reference vectors for the experimental deployer surface.

Generates `deployer-vectors.json`, which `tests/unit/deployer-parity.test.ts`
asserts against. The vectors come from the Hyperliquid Python SDK, so they pin
the TS encoder against the reference implementation rather than against itself.

Every action below is written in the exact key order the TS builders emit, so
a mismatch means the TS encoder drifted, not that the two SDKs order fields
differently.

Run with the Python SDK installed:

    python3 tests/parity/generate-deployer-vectors.py > tests/parity/deployer-vectors.json
"""

import json

from hyperliquid.utils.signing import (
    action_hash,
    add_multi_sig_fields,
    add_multi_sig_types,
    user_signed_payload,
)

MASTER = "0xa8d106881abe9a0b6ffd367788d6af91439d37f6"
LEADER = "0x251fd19df63a83652eea93a6a5e451aa5ce81e4c"
AGENT = "0xab04c8d8372d83ec939570fd2d956d0bb31aace3"
VALIDATOR = "0x5ac99df645f3414876c816caa18b2d234024b487"
NONCE = 1755530000000

# No leading zero nibbles, so the exchange's minimal-hex rendering and a
# zero-padded one agree here. See minimalSignatureHex in src/deployer/multisig.ts.
SIGS = [
    {"r": "0x" + "11" * 32, "s": "0x" + "22" * 32, "v": 27},
    {"r": "0x" + "33" * 32, "s": "0x" + "44" * 32, "v": 28},
]

# Compact, matching JavaScript's JSON.stringify. Python's json.dumps defaults
# to ", " and ": " separators; the exchange accepts either, since it parses the
# string rather than comparing it. Confirmed on testnet 19 Aug 2026.
COMPACT = (",", ":")


def h(action):
    return "0x" + action_hash(action, None, NONCE, None).hex()


def inner_envelope(action):
    return "0x" + action_hash([MASTER, LEADER, action], None, NONCE, None).hex()


def wrapper_hash(inner):
    wrapper = {
        "type": "multiSig",
        "signatureChainId": "0x66eee",
        "signatures": SIGS,
        "payload": {"multiSigUser": MASTER, "outerSigner": LEADER, "action": inner},
    }
    without_tag = wrapper.copy()
    del without_tag["type"]
    return "0x" + action_hash(without_tag, None, NONCE, None).hex()


def user_signed(action_type, **fields):
    return {
        "type": action_type,
        "signatureChainId": "0x66eee",
        "hyperliquidChain": "Testnet",
        **fields,
        "nonce": NONCE,
    }


REGISTER_STANDALONE = {
    "type": "outcomeDeploy",
    "venue": "zzz",
    "operation": {
        "registerStandaloneOutcomeFromTemplate": {
            "id": "binaryPrice4",
            "keywordToValue": [
                ["perp", "BTC"],
                ["priceDescription", "Bitcoin"],
                ["seconds", "60"],
                ["threshold", "50000"],
                ["time", "20260901-1200"],
            ],
            "deployerFeeScale": "0",
        }
    },
}

REGISTER_QUESTION = {
    "type": "outcomeDeploy",
    "venue": "zzz",
    "operation": {
        "registerQuestionFromTemplate": {
            "questionTemplateInstance": {
                "id": "sportsContestResult",
                "keywordToValue": [["participantA", "Brazil"], ["participantB", "Spain"]],
                "deployerFeeScale": "1.5",
            },
            "namedOutcomeTemplateInstances": [
                {"id": "sportsContestParticipant", "keywordToValue": [["participant", "Brazil"]]},
                {"id": "sportsContestDraw", "keywordToValue": []},
            ],
        }
    },
}

SETTLE_OUTCOME = {
    "type": "outcomeDeploy",
    "venue": "zzz",
    "operation": {
        "settleOutcome": {
            "outcome": 13065,
            "settleFraction": "1",
            "details": "",
            "nameAndDescription": [
                "template:binaryPrice4",
                "perp:BTC|threshold:50000|time:20260901-1200",
            ],
            "sideNames": ["template:Yes", "template:No"],
        }
    },
}


def named_settlement(outcome_id, fraction):
    return {
        "outcome": outcome_id,
        "settleFraction": fraction,
        "details": "",
        "nameAndDescription": ["Chicken", "N/A"],
        "sideNames": ["Yes", "No"],
    }


SETTLE_QUESTION = {
    "type": "outcomeDeploy",
    "venue": "zzz",
    "operation": {
        "settleQuestion2": {
            "question": 182,
            "outcomeSettlements": [
                named_settlement(7003, "0"),
                named_settlement(7004, "1"),
                named_settlement(7005, "0"),
            ],
            "nameAndDescription": ["What will Hypurr eat most of?", "A food journal"],
        }
    },
}

ACTIVATE = {"type": "activateOutcomeDeployer", "activate": {"venueName": "zzz"}}
DEACTIVATE = {"type": "activateOutcomeDeployer", "deactivate": None}

REGISTER_ASSOCIATE = {
    "type": "outcomeDeploy",
    "venue": "zzz",
    "operation": {
        "registerAndAssociateNamedOutcomeFromTemplate": {
            "question": 182,
            "namedOutcomeTemplateInstance": {
                "id": "sportsContestParticipant",
                "keywordToValue": [["participant", "Spain"]],
            },
        }
    },
}

SET_SUB_DEPLOYERS = {
    "type": "outcomeDeploy",
    "venue": "zzz",
    "operation": {
        "setSubDeployers": [
            {"variant": "settleOutcome", "user": AGENT, "allowed": True},
            {"variant": "settleQuestion", "user": LEADER, "allowed": False},
        ]
    },
}

USER_ACTIONS = {
    "approveAgent": user_signed("approveAgent", agentAddress=AGENT, agentName="poc"),
    "convertToMultiSigUser": user_signed(
        "convertToMultiSigUser",
        signers=json.dumps(
            {"authorizedUsers": [LEADER, MASTER], "threshold": 2}, separators=COMPACT
        ),
    ),
    "userSetAbstraction": user_signed(
        "userSetAbstraction", user=MASTER, abstraction="disabled"
    ),
    "tokenDelegate": user_signed(
        "tokenDelegate", validator=VALIDATOR, wei=10000000000, isUndelegate=False
    ),
    "cDeposit": user_signed("cDeposit", wei=12000050000),
    "cWithdraw": user_signed("cWithdraw", wei=100000000),
}

CHAIN = {"name": "hyperliquidChain", "type": "string"}
NONCE_FIELD = {"name": "nonce", "type": "uint64"}

TYPES = {
    "approveAgent": (
        "HyperliquidTransaction:ApproveAgent",
        [CHAIN, {"name": "agentAddress", "type": "address"},
         {"name": "agentName", "type": "string"}, NONCE_FIELD],
    ),
    "convertToMultiSigUser": (
        "HyperliquidTransaction:ConvertToMultiSigUser",
        [CHAIN, {"name": "signers", "type": "string"}, NONCE_FIELD],
    ),
    "userSetAbstraction": (
        "HyperliquidTransaction:UserSetAbstraction",
        [CHAIN, {"name": "user", "type": "address"},
         {"name": "abstraction", "type": "string"}, NONCE_FIELD],
    ),
    "tokenDelegate": (
        "HyperliquidTransaction:TokenDelegate",
        [CHAIN, {"name": "validator", "type": "address"},
         {"name": "wei", "type": "uint64"},
         {"name": "isUndelegate", "type": "bool"}, NONCE_FIELD],
    ),
    "cDeposit": (
        "HyperliquidTransaction:CDeposit",
        [CHAIN, {"name": "wei", "type": "uint64"}, NONCE_FIELD],
    ),
    "cWithdraw": (
        "HyperliquidTransaction:CWithdraw",
        [CHAIN, {"name": "wei", "type": "uint64"}, NONCE_FIELD],
    ),
}

abstraction_wire = dict(USER_ACTIONS["userSetAbstraction"])
abstraction_wire["abstraction"] = "i"

print(
    json.dumps(
        {
            "generatedBy": "hyperliquid-python-sdk (hyperliquid.utils.signing)",
            "regenerateWith": "python3 tests/parity/generate-deployer-vectors.py",
            "constants": {
                "master": MASTER, "leader": LEADER, "agent": AGENT,
                "validator": VALIDATOR, "nonce": NONCE, "signatures": SIGS,
            },
            "l1ActionHash": {
                "registerStandaloneOutcome": h(REGISTER_STANDALONE),
                "registerQuestion": h(REGISTER_QUESTION),
                "registerAndAssociateNamedOutcome": h(REGISTER_ASSOCIATE),
                "setSubDeployers": h(SET_SUB_DEPLOYERS),
                "settleOutcome": h(SETTLE_OUTCOME),
                "settleQuestion": h(SETTLE_QUESTION),
                "activate": h(ACTIVATE),
                "deactivate": h(DEACTIVATE),
            },
            "multiSigInnerL1Hash": {
                "registerStandaloneOutcome": inner_envelope(REGISTER_STANDALONE),
                "settleQuestion": inner_envelope(SETTLE_QUESTION),
                "activate": inner_envelope(ACTIVATE),
            },
            "multiSigEnvelopeHash": {
                **{k: wrapper_hash(v) for k, v in USER_ACTIONS.items()},
                "userSetAbstractionWire": wrapper_hash(abstraction_wire),
                "registerStandaloneOutcome": wrapper_hash(REGISTER_STANDALONE),
            },
            "userSignedPayload": {
                k: {
                    "types": add_multi_sig_types(TYPES[k][1]),
                    "primaryType": TYPES[k][0],
                    "message": add_multi_sig_fields(USER_ACTIONS[k], MASTER, LEADER),
                    "domain": user_signed_payload(TYPES[k][0], TYPES[k][1], USER_ACTIONS[k])["domain"],
                }
                for k in USER_ACTIONS
            },
        },
        indent=2,
    )
)
