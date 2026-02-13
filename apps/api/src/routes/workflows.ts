import { Hono } from "hono";
import { db } from "../db/index.js";
import { threats, events, vaults } from "../db/schema.js";
import { eq, desc, and, gte, sql } from "drizzle-orm";

const app = new Hono();

// ─── CRE Workflow Status ────────────────────────────────────────────
// Returns the status of all registered CRE workflows, including
// real-time stats from the database (events detected, threats raised).

app.get("/", async (c) => {
  // Get real stats from DB
  const allEvents = await db.query.events.findMany();
  const allThreats = await db.query.threats.findMany();
  const allVaults = await db.query.vaults.findMany();

  const now = Date.now();
  const oneDayAgo = now - 86_400_000;
  const oneWeekAgo = now - 7 * 86_400_000;

  const eventsToday = allEvents.filter(
    (e) => e.timestamp && new Date(e.timestamp).getTime() > oneDayAgo,
  );
  const eventsThisWeek = allEvents.filter(
    (e) => e.timestamp && new Date(e.timestamp).getTime() > oneWeekAgo,
  );
  const threatsToday = allThreats.filter(
    (t) => t.detectedAt && new Date(t.detectedAt).getTime() > oneDayAgo,
  );

  // Get the most recent event as "last trigger"
  const lastEvent = allEvents.length > 0
    ? allEvents.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
      })[0]
    : null;

  // Get the most recent threat
  const lastThreat = allThreats.length > 0
    ? allThreats.sort((a, b) => {
        const aTime = a.detectedAt ? new Date(a.detectedAt).getTime() : 0;
        const bTime = b.detectedAt ? new Date(b.detectedAt).getTime() : 0;
        return bTime - aTime;
      })[0]
    : null;

  // Count events by type
  const eventsByType: Record<string, number> = {};
  for (const e of allEvents) {
    eventsByType[e.type] = (eventsByType[e.type] || 0) + 1;
  }

  // Count threats by type
  const threatsByType: Record<string, number> = {};
  for (const t of allThreats) {
    threatsByType[t.type] = (threatsByType[t.type] || 0) + 1;
  }

  const workflows = [
    {
      id: "sentinel-defense",
      name: "Sentinel Defense",
      description:
        "Monitors ProtectedVault contracts for suspicious Deposit, Withdrawal, and EmergencyPause events using EVM Log Triggers. Analyzes amounts against configurable thresholds and flags threats with severity scoring.",
      status: allVaults.length > 0 ? "active" : "inactive",
      triggerType: "EVM Log Trigger",
      chain: "ethereum-testnet-sepolia",
      vaultAddress: "0xcdCc7e3d66221c22A7D2c1490120e199568fd11D",
      thresholdEth: "0.1",
      monitoredEvents: [
        "Deposit(address,uint256)",
        "Withdrawal(address,uint256)",
        "EmergencyPause(address,uint256)",
      ],
      capabilities: [
        "Event Detection",
        "Threat Analysis",
        "Severity Scoring",
        "Flash Loan Detection",
        "TVL Drain Detection",
        "Threat Correlation",
        "Webhook Notification",
        "Auto-Pause Defense",
        "CCIP Cross-Chain Pause",
      ],
      stats: {
        totalEventsDetected: allEvents.length,
        eventsToday: eventsToday.length,
        eventsThisWeek: eventsThisWeek.length,
        totalThreatsRaised: allThreats.length,
        threatsToday: threatsToday.length,
        eventsByType,
        threatsByType,
        vaultsMonitored: allVaults.length,
        activeVaults: allVaults.filter((v) => v.status === "monitoring").length,
        pausedVaults: allVaults.filter((v) => v.status === "paused").length,
      },
      lastTrigger: lastEvent
        ? {
            type: lastEvent.type,
            txHash: lastEvent.txHash,
            chain: lastEvent.chain,
            timestamp: lastEvent.timestamp
              ? new Date(lastEvent.timestamp).toISOString()
              : null,
          }
        : null,
      lastThreat: lastThreat
        ? {
            type: lastThreat.type,
            severity: lastThreat.severity,
            description: lastThreat.description,
            txHash: lastThreat.txHash,
            timestamp: lastThreat.detectedAt
              ? new Date(lastThreat.detectedAt).toISOString()
              : null,
          }
        : null,
      lastSimulation: {
        txHash:
          "0x12d62b60cf602153ceac1c420209f1f68aeef4918aaee939e9e9db5093f0821f",
        result: "HIGH severity threat detected: 0.15 ETH deposit",
        timestamp: "2025-02-08T00:00:00.000Z",
      },
    },
  ];

  return c.json({ workflows });
});

// GET /api/workflows/:id/executions — recent workflow executions (threats + events)
app.get("/:id/executions", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);

  // Get recent threats as "executions" — each threat is a workflow execution result
  const recentThreats = await db.query.threats.findMany({
    orderBy: desc(threats.detectedAt),
    limit,
  });

  const executions = recentThreats.map((t) => ({
    id: t.id,
    workflowId: "sentinel-defense",
    type: "threat_detected",
    threatType: t.type,
    severity: t.severity,
    description: t.description,
    chain: t.chain,
    txHash: t.txHash,
    responseAction: t.responseAction,
    responseStatus: t.responseStatus,
    responseTxHash: t.responseTxHash,
    timestamp: t.detectedAt ? new Date(t.detectedAt).toISOString() : null,
    resolvedAt: t.resolvedAt ? new Date(t.resolvedAt).toISOString() : null,
  }));

  return c.json({ executions, total: executions.length });
});

export default app;
