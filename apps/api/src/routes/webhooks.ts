import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { events, vaults } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { wsManager } from "../lib/ws.js";
import { threatEngine } from "../services/threat-engine.js";
import { webhookAuth } from "../middleware/auth.js";
import { webhookRateLimit } from "../middleware/rate-limit.js";
import { getRecentAuditEntries } from "../middleware/audit-log.js";
import { randomUUID } from "crypto";

const app = new Hono();

// Webhook-specific middleware
app.use("/cre", webhookRateLimit);
app.use("/cre", webhookAuth);

// ─── CRE Workflow Webhook Schema ────────────────────────────────────
// This is the PRIMARY data ingestion path. The CRE DON detects on-chain
// events with consensus and POSTs the decoded + analyzed data here.
// This replaces the old custom indexer that polled chains from the backend.
const creWebhookSchema = z.object({
  source: z.literal("cre-workflow"),
  workflowName: z.string(),
  event: z.enum(["deposit_detected", "withdrawal_detected", "pause_detected"]),
  data: z.object({
    vaultAddress: z.string(),
    chain: z.string(),
    txHash: z.string(),
    blockNumber: z.string(),
    // Deposit-specific
    depositor: z.string().optional(),
    // Withdrawal-specific
    recipient: z.string().optional(),
    // Pause-specific
    triggeredBy: z.string().optional(),
    // Amount fields (not present on pause events)
    amountWei: z.string().optional(),
    amountEth: z.string().optional(),
    // Threat analysis from CRE (threshold-based)
    threatType: z.string(),
    severity: z.string(),
    isLargeDeposit: z.boolean().optional(),
    isLargeWithdrawal: z.boolean().optional(),
    thresholdEth: z.string().optional(),
    timestamp: z.string(),
  }),
});

// Legacy schema for backwards compatibility with old webhook format
const legacyWebhookSchema = z.object({
  status: z.string().optional(),
  chain: z.string().optional(),
  vault: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  action: z.string().optional(),
  triggerData: z
    .object({
      txHash: z.string().optional(),
      blockNumber: z.number().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      amount: z.string().optional(),
      amountEth: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});

// ─── Map CRE event type to our DB event type ────────────────────────
function mapEventType(
  creEvent: string,
): "deposit" | "withdrawal" | "pause" | "sentinel_updated" {
  switch (creEvent) {
    case "deposit_detected":
      return "deposit";
    case "withdrawal_detected":
      return "withdrawal";
    case "pause_detected":
      return "pause";
    default:
      return "deposit";
  }
}

// POST /api/webhooks/cre — PRIMARY data ingestion from CRE DON
// The CRE workflow detects events with DON consensus and POSTs here.
// This replaces the custom backend indexer.
app.post("/cre", async (c) => {
  const body = c.get("parsedBody" as never) || (await c.req.json());

  // Try new CRE workflow format first
  const creParsed = creWebhookSchema.safeParse(body);

  if (creParsed.success) {
    return await handleCREWebhook(c, creParsed.data);
  }

  // Fall back to legacy format
  const legacyParsed = legacyWebhookSchema.safeParse(body);
  if (legacyParsed.success) {
    return await handleLegacyWebhook(c, body);
  }

  console.warn("[Webhook] Invalid payload — neither CRE nor legacy format");
  return c.json({ error: "Invalid webhook payload" }, 400);
});

// ─── Handle CRE Workflow Webhook (new format) ───────────────────────
async function handleCREWebhook(
  c: any,
  payload: z.infer<typeof creWebhookSchema>,
) {
  const { event, data } = payload;

  console.log(
    `[CRE Webhook] ${event} on ${data.vaultAddress} (${data.chain}) | severity=${data.severity}`,
  );

  // Find the vault by address (normalize to lowercase)
  const vaultAddress = data.vaultAddress.toLowerCase();
  const vaultRecord = await db.query.vaults.findFirst({
    where: eq(vaults.address, vaultAddress),
  });

  if (!vaultRecord) {
    console.warn(`[CRE Webhook] Unknown vault address: ${data.vaultAddress}`);
    return c.json({ received: true, warning: "Unknown vault" });
  }

  // Determine from/to addresses based on event type
  let fromAddress: string | null = null;
  let toAddress: string | null = null;

  if (event === "deposit_detected") {
    fromAddress = data.depositor || null;
    toAddress = data.vaultAddress;
  } else if (event === "withdrawal_detected") {
    fromAddress = data.vaultAddress;
    toAddress = data.recipient || null;
  } else if (event === "pause_detected") {
    fromAddress = data.triggeredBy || null;
  }

  // Create event record in database
  const eventType = mapEventType(event);
  const amountEth = data.amountEth ? Number(data.amountEth) : null;

  const eventRecord = {
    id: randomUUID(),
    vaultId: vaultRecord.id,
    type: eventType,
    txHash: data.txHash,
    blockNumber: Number(data.blockNumber) || 0,
    fromAddress,
    toAddress,
    amount: data.amountWei || null,
    amountEth,
    chain: data.chain,
  };

  await db.insert(events).values(eventRecord);

  // Broadcast to dashboard via WebSocket
  wsManager.broadcast("new_event", {
    ...eventRecord,
    source: "cre_workflow",
    creSeverity: data.severity,
    creThreatType: data.threatType,
    timestamp: new Date().toISOString(),
  });

  // If this is a pause event, update vault status
  if (event === "pause_detected") {
    await db
      .update(vaults)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(vaults.id, vaultRecord.id));

    wsManager.broadcast("vault_status_change", {
      vaultId: vaultRecord.id,
      status: "paused",
    });
  }

  // Run threat analysis in the background so we can return 200 immediately.
  // Defense actions (on-chain pause, CCIP cross-chain) can take 30-60s and
  // would otherwise exceed the CRE HTTP capability's timeout.
  const analyzeInBackground = async () => {
    try {
      await threatEngine.analyze(eventRecord, vaultRecord.id, {
        creSeverity: data.severity,
        creThreatType: data.threatType,
      });

      // Broadcast CRE workflow activity for dashboard monitoring
      wsManager.broadcast("cre_callback", {
        source: "cre-workflow",
        event,
        chain: data.chain,
        vault: data.vaultAddress,
        severity: data.severity,
        threatType: data.threatType,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `[CRE Webhook] Processed ${event}: stored event ${eventRecord.id}, threat analysis complete`,
      );
    } catch (err) {
      console.error(
        `[CRE Webhook] Background threat analysis failed for ${eventRecord.id}:`,
        err,
      );
    }
  };

  // Fire-and-forget — don't await
  analyzeInBackground();

  return c.json({
    received: true,
    vaultId: vaultRecord.id,
    eventId: eventRecord.id,
    source: "cre-workflow",
  });
}

// ─── Handle Legacy Webhook (backwards compatibility) ────────────────
async function handleLegacyWebhook(c: any, body: any) {
  console.log(
    "[Webhook] Legacy CRE callback received:",
    JSON.stringify(body).slice(0, 200),
  );

  const { status, chain, vault: vaultAddress, action, triggerData } = body;

  const vaultRecord = await db.query.vaults.findFirst({
    where: eq(vaults.address, (vaultAddress || "").toLowerCase()),
  });

  if (!vaultRecord) {
    console.warn(`[Webhook] Unknown vault address: ${vaultAddress}`);
    return c.json({ received: true, warning: "Unknown vault" });
  }

  if (triggerData) {
    const eventRecord = {
      id: randomUUID(),
      vaultId: vaultRecord.id,
      type: "deposit" as const,
      txHash: triggerData.txHash || "",
      blockNumber: triggerData.blockNumber || 0,
      fromAddress: triggerData.from || null,
      toAddress: triggerData.to || null,
      amount: triggerData.amount || null,
      amountEth: triggerData.amountEth || null,
      chain: chain || vaultRecord.chain,
    };

    await db.insert(events).values(eventRecord);

    wsManager.broadcast("new_event", {
      ...eventRecord,
      source: "legacy_webhook",
      timestamp: new Date().toISOString(),
    });

    await threatEngine.analyze(eventRecord, vaultRecord.id);
  }

  wsManager.broadcast("cre_callback", {
    status,
    chain,
    vault: vaultAddress,
    action,
    timestamp: new Date().toISOString(),
  });

  return c.json({ received: true, vaultId: vaultRecord.id });
}

// GET /api/webhooks/health — health check for CRE
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    wsClients: wsManager.count,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/webhooks/audit-log — view recent audit trail
app.get("/audit-log", (c) => {
  const limit = Number(c.req.query("limit") || 50);
  const entries = getRecentAuditEntries(Math.min(limit, 200));
  return c.json({ entries, total: entries.length });
});

export default app;
