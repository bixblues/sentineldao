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

// ─── Validation schemas ─────────────────────────────────────────────
const creWebhookSchema = z.object({
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

// POST /api/webhooks/cre — receives callbacks from CRE monitor workflow
app.post("/cre", async (c) => {
  // Use parsed body from webhook auth middleware if available, otherwise parse
  const body = c.get("parsedBody" as never) || (await c.req.json());

  // Validate input
  const parsed = creWebhookSchema.safeParse(body);
  if (!parsed.success) {
    console.warn("[Webhook] Invalid payload:", parsed.error.flatten());
    return c.json(
      { error: "Invalid webhook payload", details: parsed.error.flatten() },
      400,
    );
  }

  console.log("[Webhook] CRE callback received:", JSON.stringify(parsed.data));

  // CRE workflow sends: { status, chain, vault, timestamp, action, triggerData }
  const { status, chain, vault: vaultAddress, action, triggerData } = body;

  // Find the vault
  const vaultRecord = await db.query.vaults.findFirst({
    where: eq(vaults.address, (vaultAddress || "").toLowerCase()),
  });

  if (!vaultRecord) {
    console.warn(`[Webhook] Unknown vault address: ${vaultAddress}`);
    return c.json({ received: true, warning: "Unknown vault" });
  }

  // If trigger data includes event details, create an event record
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
      source: "cre_workflow",
      timestamp: new Date().toISOString(),
    });

    // Run through threat engine
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
});

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
