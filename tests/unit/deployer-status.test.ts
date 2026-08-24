import { describe, expect, it } from "vitest";
import type { HIP4Client } from "../../src/adapter/hyperliquid/client";
import type { HLExtraAgent } from "../../src/adapter/hyperliquid/types";
import {
  activeAgents,
  agentStatus,
  expiringAgents,
  findAgent,
} from "../../src/deployer/agent";
import { feeAmounts, feeSplit } from "../../src/deployer/fees";
import {
  canDeploy,
  deployBlockedReason,
  deployerSteps,
  DEPLOYER_LIMITS,
  isDeployerAbstraction,
  readDeployerSnapshot,
} from "../../src/deployer/status";
import type { DeployerSnapshot } from "../../src/deployer/status";
import { createMockClient } from "../helpers/mock-client";

const MASTER = "0xa8D106881abE9a0B6FfD367788d6aF91439D37F6";
const NOW = 1_755_530_000_000;
const DAY = 24 * 60 * 60 * 1000;

const AGENTS: HLExtraAgent[] = [
  { name: "poc", address: "0x97e70d7b6d8440c91818d6f712b6d0a802e344a3", validUntil: NOW + 30 * DAY },
  { name: "cold", address: "0xab04c8d8372d83ec939570fd2d956d0bb31aace3", validUntil: NOW - DAY },
];

function snapshot(over: Partial<DeployerSnapshot> = {}): DeployerSnapshot {
  return {
    master: MASTER,
    masterExists: true,
    role: "user",
    authorizedUsers: [],
    threshold: 0,
    isMultiSig: false,
    abstraction: "disabled",
    abstractionOk: true,
    stakedHype: 120,
    venue: "zzz",
    active: true,
    agents: AGENTS,
    activeOutcomes: 2,
    limits: DEPLOYER_LIMITS.testnet,
    unreachable: false,
    ...over,
  };
}

describe("account abstraction", () => {
  it("accepts the modes a deployer may use, under all three of their names", () => {
    expect(isDeployerAbstraction("disabled")).toBe(true);
    expect(isDeployerAbstraction("default")).toBe(true);
    expect(isDeployerAbstraction(null)).toBe(true);
    expect(isDeployerAbstraction("unifiedAccount")).toBe(false);
    expect(isDeployerAbstraction("portfolioMargin")).toBe(false);
  });
});

describe("readDeployerSnapshot", () => {
  it("reads venue, stake, agents and outcome count in one pass", async () => {
    const client = createMockClient();
    client.fetchOutcomeMeta.mockResolvedValue({
      outcomes: [
        { outcome: 1, name: "a", description: "", sideSpecs: [], venue: "zzz" },
        { outcome: 2, name: "b", description: "", sideSpecs: [], venue: "aa" },
      ],
      questions: [],
      deployers: [{ deployer: MASTER.toLowerCase(), venue: "zzz" }],
    });
    client.fetchDelegatorSummary.mockResolvedValue({
      delegated: "120.00300744",
      undelegated: "0.0",
      totalPendingWithdrawal: "0.0",
      nPendingWithdrawals: 0,
    });
    client.fetchMultiSigSigners.mockResolvedValue({
      authorizedUsers: ["0x" + "11".repeat(20), "0x" + "22".repeat(20)],
      threshold: 2,
    });
    client.fetchExtraAgents.mockResolvedValue(AGENTS);

    const s = await readDeployerSnapshot(client as unknown as HIP4Client, MASTER);
    expect(s.venue).toBe("zzz");
    expect(s.active).toBe(true);
    expect(s.isMultiSig).toBe(true);
    expect(s.threshold).toBe(2);
    expect(s.stakedHype).toBeCloseTo(120.003, 3);
    expect(s.activeOutcomes).toBe(1);
    expect(s.abstractionOk).toBe(true);
    expect(s.unreachable).toBe(false);
  });

  it("reports an account the chain has never seen without calling it unreachable", async () => {
    const client = createMockClient();
    client.fetchUserRole.mockResolvedValue({ role: "missing" });
    client.fetchOutcomeMeta.mockResolvedValue({ outcomes: [], questions: [], deployers: [] });
    const s = await readDeployerSnapshot(client as unknown as HIP4Client, MASTER);
    expect(s.masterExists).toBe(false);
    expect(s.active).toBe(false);
    expect(s.unreachable).toBe(false);
  });

  it("calls it unreachable only when the reads fail together", async () => {
    const client = createMockClient();
    const boom = () => Promise.reject(new Error("network"));
    client.fetchUserRole.mockImplementation(boom);
    client.fetchOutcomeMeta.mockImplementation(boom);
    const s = await readDeployerSnapshot(client as unknown as HIP4Client, MASTER);
    expect(s.unreachable).toBe(true);
  });

  it("survives one read failing on its own", async () => {
    const client = createMockClient();
    client.fetchDelegatorSummary.mockImplementation(() =>
      Promise.reject(new Error("network")),
    );
    client.fetchOutcomeMeta.mockResolvedValue({ outcomes: [], questions: [], deployers: [] });
    const s = await readDeployerSnapshot(client as unknown as HIP4Client, MASTER);
    expect(s.unreachable).toBe(false);
    expect(s.stakedHype).toBe(0);
  });

  it("returns an empty snapshot for an empty address without touching the chain", async () => {
    const client = createMockClient();
    const s = await readDeployerSnapshot(client as unknown as HIP4Client, "");
    expect(s.masterExists).toBe(false);
    expect(client.fetchOutcomeMeta).not.toHaveBeenCalled();
  });
});

describe("readiness", () => {
  it("allows a deploy when active, staked and under the cap", () => {
    expect(canDeploy(snapshot())).toBe(true);
    expect(deployBlockedReason(snapshot())).toBeNull();
  });

  it("names the one thing in the way", () => {
    expect(deployBlockedReason(snapshot({ active: false }))).toMatch(/not an active/);
    expect(deployBlockedReason(snapshot({ stakedHype: 1 }))).toMatch(/needs 100/);
    expect(deployBlockedReason(snapshot({ activeOutcomes: 10 }))).toMatch(/slots are in use/);
    expect(deployBlockedReason(snapshot({ unreachable: true }))).toMatch(/could not be read/);
  });

  it("marks the steps that are done and blocks the rest with a reason", () => {
    const steps = deployerSteps(snapshot({ active: false, stakedHype: 0 }));
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey.master?.state).toBe("done");
    expect(byKey.activate?.state).toBe("blocked");
    expect(byKey.activate?.blockedBy).toMatch(/100 HYPE/);
    expect(byKey.activate?.oneWay).toBe(true);
    expect(byKey.agent?.state).toBe("blocked");
  });

  it("marks the agent step done when this host holds an approved key", () => {
    const steps = deployerSteps(snapshot(), {
      agentAddress: AGENTS[0]?.address,
      now: NOW,
    });
    expect(steps.find((s) => s.key === "agent")?.state).toBe("done");
  });

  it("blocks everything with one reason when the chain cannot be read", () => {
    const steps = deployerSteps(snapshot({ unreachable: true }));
    expect(steps.every((s) => s.state === "blocked")).toBe(true);
  });
});

describe("agents", () => {
  it("finds an approval case-blind", () => {
    expect(findAgent(AGENTS, (AGENTS[0]?.address ?? "").toUpperCase())?.name).toBe("poc");
    expect(findAgent(AGENTS, "0x" + "99".repeat(20))).toBeNull();
  });

  it("treats a lapsed approval as not approved", () => {
    expect(activeAgents(AGENTS, NOW).map((a) => a.name)).toEqual(["poc"]);
    const lapsed = agentStatus(AGENTS, AGENTS[1]?.address ?? "", NOW);
    expect(lapsed.expired).toBe(true);
    expect(lapsed.approved).toBe(false);
    expect(lapsed.expiresInMs).toBe(0);
  });

  it("reports how long an approval has left", () => {
    const live = agentStatus(AGENTS, AGENTS[0]?.address ?? "", NOW);
    expect(live.approved).toBe(true);
    expect(live.expiresInMs).toBe(30 * DAY);
  });

  it("reports an address that was never approved", () => {
    const none = agentStatus(AGENTS, "0x" + "99".repeat(20), NOW);
    expect(none).toMatchObject({ approved: false, expired: false, validUntil: null });
  });

  it("lists approvals lapsing inside a window, soonest first", () => {
    expect(expiringAgents(AGENTS, 60 * DAY, NOW).map((a) => a.name)).toEqual(["poc"]);
    expect(expiringAgents(AGENTS, DAY, NOW)).toEqual([]);
  });
});

describe("fee scale", () => {
  it("never lets the protocol take less than 1x", () => {
    expect(feeSplit(0)).toEqual({ total: 1, deployer: 0, protocol: 1 });
    expect(feeSplit(0.5)).toEqual({ total: 1.5, deployer: 0.5, protocol: 1 });
    expect(feeSplit(3)).toEqual({ total: 6, deployer: 3, protocol: 3 });
  });

  it("clamps a scale outside the allowed band", () => {
    expect(feeSplit(20).deployer).toBe(10);
    expect(feeSplit(-1).deployer).toBe(0);
  });

  it("splits the money on a closing trade", () => {
    const money = feeAmounts(1, 10_000);
    expect(money.base).toBeCloseTo(7, 6);
    expect(money.trader).toBeCloseTo(14, 6);
    expect(money.deployer).toBeCloseTo(7, 6);
  });
});
