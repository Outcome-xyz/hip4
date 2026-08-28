# Deployer

> **Experimental.** Everything on this page may change without a major
> version. Deploy and settle follow Hyperliquid's published
> [HIP-4 deployer actions](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions)
> reference, checked against testnet on 28 August 2026. Native multi-sig has
> no published schema; its shapes were read back from the live API and from a
> testnet run on 18 August 2026.

Registering markets, settling them, approving agents, and running a deployer
whose stake sits behind a multi-sig.

## The shape of it

```
master account (holds the stake, 2-of-3 multi-sig)
  |
  |  approveAgent, once or twice a year, signed by the founders' own wallets
  v
agent (holds nothing, cannot move funds)
  |
  |  outcomeDeploy (register / settle), alone, one signature, no quorum
  v
Hyperliquid
```

Two signing paths, and the difference is what makes this design work:

| Action                                              | Domain                      | Chain  | A browser wallet can sign it |
| --------------------------------------------------- | --------------------------- | ------ | ---------------------------- |
| deploy, settle, activate                            | `Exchange` (phantom agent)  | 1337   | no                           |
| `approveAgent`, `convertToMultiSigUser`, staking    | `HyperliquidSignTransaction`| real   | yes                          |

Because deploy and settle are unsignable by a wallet, they get delegated to an
agent. Because `approveAgent` is ordinary typed data, the founders can approve
that agent from their own wallets and never touch a raw key.

## Reading state

```typescript
import { createHIP4Adapter, deployerSteps, deployBlockedReason } from "@outcome.xyz/hip4";

const adapter = createHIP4Adapter({ testnet: true });
const snapshot = await adapter.deployer.fetchSnapshot(master);

snapshot.venue;          // "zzz" once activated
snapshot.stakedHype;     // delegated HYPE, what the requirement measures
snapshot.abstractionOk;  // whether the account mode allows deploying
snapshot.isMultiSig;     // threshold and authorizedUsers alongside
snapshot.agents;         // approvals, with their expiry

deployBlockedReason(snapshot); // null, or the one thing in the way
deployerSteps(snapshot);       // the onboarding sequence, resolved live
```

Nothing is stored. Every step is complete because Hyperliquid says so, which
makes a flow resumable from anywhere and unable to disagree with reality.

### Account abstraction, three names for one setting

| Where            | What it is called      |
| ---------------- | ---------------------- |
| HIP-4 spec       | Standard               |
| Hyperliquid app  | Portfolio, **Manual**  |
| `userAbstraction`| `disabled`             |
| Wire value       | `i`                    |

`isDeployerAbstraction()` accepts `disabled`, `default`, or absent. Set this
**before** activating: activation is a one-way door, and correcting the mode
afterwards is possible but there is no reason to need it.

## Templates

```typescript
import { requireTemplate, assertTemplateInstance, toTemplateStamp } from "@outcome.xyz/hip4";

const registry = await adapter.deployer.fetchTemplates();
const template = requireTemplate(registry, "binaryPrice4");

const values = {
  perp: "BTC",
  threshold: "50000",
  time: toTemplateStamp(new Date(Date.now() + 15 * 60_000)), // 20260901-1200
};
assertTemplateInstance(template, values); // throws with every problem at once
```

Validate locally first. The numeric grammars are exact rather than lenient:
the exchange refuses a sign, an exponent, or a leading or trailing zero, and
refusing it here costs a correction while refusing it there costs one of the
day's deploys.

Template ids carry a version as a trailing index. `splitBySeries(registry)`
separates what to offer from what a newer id replaced.

## Deploying and settling

```typescript
adapter.deployer.setSigner(agentSigner); // an approved agent key

await adapter.deployer.registerStandaloneOutcome({
  venue: "zzz", // every outcomeDeploy names the deployer's venue
  templateId: "binaryPrice4",
  values,
  deployerFeeScale: "0",
});

await adapter.deployer.registerQuestion({
  venue: "zzz",
  question: { templateId: "sportsContestResult", values: questionValues },
  namedOutcomes: [
    { templateId: "sportsContestParticipant", values: { participant: "Brazil" } },
    { templateId: "sportsContestDraw", values: {} },
  ],
});

// add a named outcome to a live question; it inherits the question's fee scale
await adapter.deployer.registerAndAssociateNamedOutcome({
  venue: "zzz",
  question: 182,
  namedOutcome: { templateId: "sportsContestParticipant", values: { participant: "Spain" } },
});

// settleFraction: "1" pays the first side, "0" the second. A standalone
// outcome may split ("0.66"); a question outcome must be exactly "0" or "1".
// The venue is read from the outcome's own metadata.
await adapter.deployer.settleOutcome({ outcomeId: 13065, settleFraction: "1" });
await adapter.deployer.settleQuestion({ questionId: 182, winner: 7004 });

// let another key register and settle on this venue
await adapter.deployer.setSubDeployers({
  venue: "zzz",
  entries: [
    { variant: "registerStandaloneOutcomeFromTemplate", user: operator, allowed: true },
    { variant: "settleOutcome", user: operator, allowed: true },
  ],
});
```

Every deploy and settle action is `{ type: "outcomeDeploy", venue, operation }`.
The venue is required; a sub-deployer passes the venue of the deployer it acts
for, and settlements can only target that venue's outcomes. `details` on a
settlement is always empty. A question takes at most 100 named outcomes.

Settling echoes the outcome's name, description and side names back verbatim,
so `settleOutcome` reads them from `outcomeMeta` rather than taking them on
trust. A settled outcome is pruned from `outcomeMeta`, so settle before the
metadata is gone.

Every result carries `nonce` and `actionHash`. The hash is what a founder
approval or a replay check should be recorded against.

Errors split by where they happen. A malformed action throws `DeployerError`
before anything is signed, because that is a bug to fix rather than a
condition to handle. Anything the exchange refuses comes back as
`{ success: false, error }`, so a refusal never costs an unhandled rejection.

## Reading a deployed market back

The exchange assigns the outcome id and echoes the instance back as a
pipe-joined description. `readDeployedOutcome` reads it home again.

```typescript
import { readDeployedOutcome } from "@outcome.xyz/hip4";

const decoded = readDeployedOutcome(outcome);
decoded.templateId;          // "binaryPrice4", or null for a market with no template
decoded.keywords;            // aliases resolved to current template names
decoded.eventAt;             // when the event happens
decoded.resolutionDeadline;  // the template's own deadline, where it has one
decoded.perp;                // "BTC"
decoded.threshold;           // "50000", a string, compared with decimal math
```

Two things this exists to smooth over.

**Generations name the same concept differently.** `binaryPrice` says `perp` /
`threshold` / `time`; a protocol-generated `class:priceBinary` market says
`underlying` / `targetPrice` / `expiry`; `priceTouch` says `target` where
`binaryPrice` says `threshold`. `canonicalKeywords` maps the older names onto
the current ones, and `perpFrom` / `thresholdFrom` read either.

Note this is separate from `parseDescription` / `discoverPriceBinaryMarkets`,
which handle only the `class:priceBinary` form.

**A question's outcomes carry no times of their own.** Registering
`sportsContestResult` puts `scheduledStart` and `resolutionDeadline` on the
question; each named outcome gets only its own keyword, `participant:Alpha`, or
an empty description for a draw. Pass the parent question, or use
`readDeployedOutcomes` / `fetchDeployedOutcomes`, which wire it up for you.
Without it every named outcome reads as having no deadline.

**A template publishes up to two times, not one.** `sportsContest*` carries
both `scheduledStart` and `resolutionDeadline`; `policyRateDecision` carries
`scheduledDecision` and `decisionDeadline`; `binaryPrice*` carries only
`time`. Conflating them makes every sports market look overdue at kickoff.

## What you owe settlement on

Settlement is the one irreversible action with a penalty on its deadline, so
this derives its answers rather than being told them. An outcome still listed
in `outcomeMeta` is by definition unsettled, because settling prunes it, so
nothing has to be recorded on your side.

```typescript
const queue = await adapter.deployer.fetchSettlementQueue(master, {
  settleWithinMs: 6 * 60 * 60 * 1000, // your number, see below
  warnLeadMs: 30 * 60 * 1000,
});

for (const item of queue) {
  item.state;                // "overdue" | "due" | "unknown"
  item.deadline;
  item.deadlineIsPublished;  // true when it came from the template
  item.lateBy;
}
```

Worst first. Markets that are simply waiting are dropped; `unknown` is kept,
because a market nothing can judge is exactly the one worth looking at.

**`settleWithinMs` is required and has no default.** Where a template
publishes a `resolutionDeadline`, that is the protocol's number and it wins.
Where it does not, this window is used, and HIP-4 publishes no general figure
for it. Putting an invented default in front of an operator would be worse
than asking.

`suggestPriceSettlement({ markPx, threshold, eventAt })` applies a price
template's own published rule to a mark. It returns null until the event time
has passed, and it is a suggestion: the deployer is the oracle.

## Multi-sig

Once an account is converted, **every** action from it must be wrapped. The
leader must be an authorised user and can never be the multi-sig account
itself.

```typescript
import {
  APPROVE_AGENT_TYPES,
  buildApproveAgentAction,
  nextNonce,
  signMultiSigInnerUserSignedAction,
} from "@outcome.xyz/hip4";

// One nonce, shared by every inner signature and by the submission.
const nonce = nextNonce();
const action = buildApproveAgentAction({ agentAddress, agentName: "ops", nonce, network: "testnet" });

const signatures = await Promise.all(
  founders.map((signer) =>
    signMultiSigInnerUserSignedAction({
      signer, multiSigUser: master, outerSigner: leader.address,
      network: "testnet", action, types: APPROVE_AGENT_TYPES,
    }),
  ),
);

adapter.deployer.setSigner(leaderSigner);
await adapter.deployer.submitMultiSig({ multiSigUser: master, action, signatures, nonce });
```

For an L1 action, swap `signMultiSigInnerUserSignedAction` for
`signMultiSigInnerL1Action`. That one signs on chain 1337, so it needs raw
keys rather than browser wallets.

Every signature must be over the same nonce and name the same leader. The
envelope hashing is pinned against the Hyperliquid Python SDK in
`tests/unit/deployer-multisig.test.ts`.

### What was measured

Testnet, 18 August 2026, against a live staked deployer converted to 2 of 3:

| Test                                          | Result                     |
| --------------------------------------------- | -------------------------- |
| Convert a live, staked, active deployer       | ok                         |
| Deployer status survives conversion           | still active               |
| `userAbstraction` survives conversion         | `disabled` before and after|
| Master signs for itself after conversion      | `Multi-sig required`       |
| deploy via the quorum                         | ok                         |
| `approveAgent` via the quorum                 | ok                         |
| Agent deploys alone, no quorum                | ok                         |
| Agent settles alone, no quorum                | ok                         |
| One founder alone, or an unapproved key       | refused                    |

Re-measured end to end through this SDK on 19 Aug 2026, against the same
deployer: register, settle, register a question, settle a question, all signed
by the agent alone; register through the quorum; `approveAgent`,
`userSetAbstraction`, `convertToMultiSigUser`, `tokenDelegate` and `cDeposit`
all through the quorum. Settling prunes an outcome from `outcomeMeta`, which is
what lets the settlement queue work without keeping records.

## Things that cost people afternoons

**`Invalid multi-sig outer signer` has two causes, and neither is the outer
signer.** Both were measured on testnet, 19 Aug 2026.

*Address casing.* An address field parsed as bytes is lowercased across the
network, so a checksummed one recovers a different signer. A checksummed
`agentAddress` failed 4 of 4 attempts; the same action lowercased verified 2 of
2. The builders here lowercase for you; if you hand-roll an action, do the same.

*Signature rendering.* The exchange renders `r` and `s` as minimal-length hex
when it recomputes the envelope hash, stripping leading zeros. Every standard
signer zero-pads to 32 bytes. The inner signatures sit inside the MessagePack
the outer hash covers, so the two forms disagree whenever a component's top
nibble is zero: four values across two signers, one chance in sixteen each,
which is roughly one submission in four. Zero-padded and affected was accepted
0 of 2 times; minimal and affected, 6 of 6; after the fix, 24 of 24 including 7
that would have failed. `buildMultiSigAction` renders them correctly, so this
only bites if you assemble the wrapper yourself, in which case use
`minimalSignatureHex`.

The second one is worth knowing about even away from this SDK: it is
intermittent, it looks like a flaky exchange, and the Python SDK never hits it
only because `to_hex` happens to strip leading zeros already.

**Activation is a one-way door.** The stake is committed for the minimum
staking period of 183 days, and the account must be on Standard abstraction.
Deactivation needs that period elapsed and no active outcomes, and is
permanent: the account can never activate again. The venue name is 2 to 4
lowercase letters, globally unique across every deployer including
deactivated ones, shared with the perp DEX namespace (`spot` is reserved),
and never released. Do not spend one you want for production on a test.

**An unfunded address cannot be converted.** It is not an L1 user until the
exchange has seen it, so "convert while empty" means no stake and no deployer
role, not a zero balance. Every party to a multi-sig action has to exist,
signers and leader alike.

**Diary the agent expiry.** Approvals run at most 180 days and commonly land
nearer 90. Named slots are capped at 3, rising with volume, and re-approving
an existing name replaces that agent rather than adding one. A lapse stops
deployment and settlement, and settlement deadlines carry a penalty.
`expiringAgents(agents, 30 * DAY)` is there for exactly this.

**`userSetAbstraction` is not `agentSetAbstraction`.** The first is a
user-signed action that also works through a quorum, exposed here as
`deployer.setAbstraction`. The second is an L1 action an approved agent signs
for its master, exposed as `wallet.agentSetAbstraction`. They are different
actions and take different signers.

## Limits

`DEPLOYER_LIMITS` carries the published numbers per chain. Read them as a
starting point and confirm against the exchange before relying on one; they
move as HIP-4 rolls out.

## Fees

A deployer sets a fee scale from 0 to 10 on the markets it creates. The
trader pays `(scale + protocol) x` the base spot taker rate, where the
protocol's own share is `max(scale, 1)`. Opens are free; the fee falls on the
closing trade.

```typescript
feeSplit(0.5);            // { total: 1.5, deployer: 0.5, protocol: 1 }
feeAmounts(1, 10_000);    // base 7, trader 14, deployer 7, protocol 7
```

## Examples

- `examples/deployer-status.ts` reads a deployer's state, read-only.
- `examples/deploy-and-settle.ts` registers and settles as an agent.
- `examples/multisig-approve-agent.ts` approves an agent through a 2 of 3.
