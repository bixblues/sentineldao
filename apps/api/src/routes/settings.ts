import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { settings, alertRules, integrations, tenants } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { testWebhook } from "../services/notifications.js";
import { randomUUID } from "crypto";
import { getTenantContext } from "../middleware/tenant-auth.js";

const app = new Hono();

// ─── Global Settings ────────────────────────────────────────────────

// GET /api/settings
app.get("/", async (c) => {
  const allSettings = await db.query.settings.findMany();
  const map: Record<string, unknown> = {};
  for (const s of allSettings) {
    map[s.key] = s.value;
  }
  return c.json({ settings: map });
});

// ─── CCIP Configuration (must be before /:key route) ───────────────

const ccipConfigSchema = z.object({
  ccipSenderAddress: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^0x[a-fA-F0-9]{40}$/.test(val),
      "Invalid Ethereum address format",
    ),
  ccipReceiverArbitrum: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^0x[a-fA-F0-9]{40}$/.test(val),
      "Invalid Ethereum address format",
    ),
  ccipReceiverBase: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^0x[a-fA-F0-9]{40}$/.test(val),
      "Invalid Ethereum address format",
    ),
  ccipEnabled: z.boolean(),
});

// GET /api/settings/ccip
app.get("/ccip", async (c) => {
  const { tenantId } = getTenantContext(c);

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  return c.json({
    ccipSenderAddress: tenant.ccipSenderAddress,
    ccipReceiverArbitrum: tenant.ccipReceiverArbitrum,
    ccipReceiverBase: tenant.ccipReceiverBase,
    ccipEnabled: tenant.ccipEnabled,
  });
});

// PUT /api/settings/ccip
app.put("/ccip", async (c) => {
  const { tenantId } = getTenantContext(c);
  const body = await c.req.json();

  const parsed = ccipConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    await db
      .update(tenants)
      .set({
        ccipSenderAddress: parsed.data.ccipSenderAddress || null,
        ccipReceiverArbitrum: parsed.data.ccipReceiverArbitrum || null,
        ccipReceiverBase: parsed.data.ccipReceiverBase || null,
        ccipEnabled: parsed.data.ccipEnabled,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    const updatedTenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    return c.json({
      success: true,
      config: {
        ccipSenderAddress: updatedTenant?.ccipSenderAddress,
        ccipReceiverArbitrum: updatedTenant?.ccipReceiverArbitrum,
        ccipReceiverBase: updatedTenant?.ccipReceiverBase,
        ccipEnabled: updatedTenant?.ccipEnabled,
      },
    });
  } catch (error) {
    console.error("[CCIP Config] Database error:", error);
    return c.json({ error: "Failed to update CCIP configuration" }, 500);
  }
});

// PUT /api/settings/:key
app.put("/:key", async (c) => {
  const key = c.req.param("key");
  const { value } = await c.req.json();

  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });

  return c.json({ key, value });
});

// ─── Alert Rules ────────────────────────────────────────────────────

const alertRuleSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "large_transfer",
    "rapid_transactions",
    "unauthorized_access",
    "custom",
  ]),
  enabled: z.boolean().optional().default(true),
  params: z.record(z.unknown()).optional(),
  severity: z
    .enum(["critical", "high", "medium", "low"])
    .optional()
    .default("medium"),
  responseType: z
    .enum(["alert_only", "pause_single", "pause_all_ccip"])
    .optional()
    .default("alert_only"),
});

// GET /api/settings/rules
app.get("/rules", async (c) => {
  const { tenantId } = getTenantContext(c);
  const rules = await db.query.alertRules.findMany({
    where: eq(alertRules.tenantId, tenantId),
  });
  return c.json({ rules });
});

// POST /api/settings/rules
app.post("/rules", async (c) => {
  const { tenantId } = getTenantContext(c);
  const body = await c.req.json();
  const parsed = alertRuleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const rule = { id: randomUUID(), tenantId, ...parsed.data };
  await db.insert(alertRules).values(rule);
  return c.json({ rule }, 201);
});

// PATCH /api/settings/rules/:id
app.patch("/rules/:id", async (c) => {
  const { tenantId } = getTenantContext(c);
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await db.query.alertRules.findFirst({
    where: and(eq(alertRules.id, id), eq(alertRules.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "Rule not found" }, 404);

  await db.update(alertRules).set(body).where(eq(alertRules.id, id));
  return c.json({ rule: { ...existing, ...body } });
});

// DELETE /api/settings/rules/:id
app.delete("/rules/:id", async (c) => {
  const { tenantId } = getTenantContext(c);
  const id = c.req.param("id");

  // Verify rule belongs to tenant before deleting
  const existing = await db.query.alertRules.findFirst({
    where: and(eq(alertRules.id, id), eq(alertRules.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "Rule not found" }, 404);

  await db.delete(alertRules).where(eq(alertRules.id, id));
  return c.json({ success: true });
});

// ─── Integrations ───────────────────────────────────────────────────

const integrationSchema = z.object({
  type: z.enum(["slack", "discord", "pagerduty", "telegram", "custom_webhook"]),
  name: z.string().min(1),
  webhookUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  severities: z.array(z.string()).optional().default(["critical", "high"]),
});

// GET /api/settings/integrations
app.get("/integrations", async (c) => {
  const { tenantId } = getTenantContext(c);
  const all = await db.query.integrations.findMany({
    where: eq(integrations.tenantId, tenantId),
  });
  return c.json({ integrations: all });
});

// POST /api/settings/integrations
app.post("/integrations", async (c) => {
  const { tenantId } = getTenantContext(c);
  const body = await c.req.json();
  const parsed = integrationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const integration = { id: randomUUID(), tenantId, ...parsed.data };
  await db.insert(integrations).values(integration);
  return c.json({ integration }, 201);
});

// PATCH /api/settings/integrations/:id
app.patch("/integrations/:id", async (c) => {
  const { tenantId } = getTenantContext(c);
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await db.query.integrations.findFirst({
    where: and(eq(integrations.id, id), eq(integrations.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "Integration not found" }, 404);

  await db.update(integrations).set(body).where(eq(integrations.id, id));
  return c.json({ integration: { ...existing, ...body } });
});

// DELETE /api/settings/integrations/:id
app.delete("/integrations/:id", async (c) => {
  await db.delete(integrations).where(eq(integrations.id, c.req.param("id")));
  return c.json({ success: true });
});

// POST /api/settings/integrations/:id/test — test a webhook
app.post("/integrations/:id/test", async (c) => {
  const id = c.req.param("id");
  const integration = await db.query.integrations.findFirst({
    where: eq(integrations.id, id),
  });
  if (!integration) return c.json({ error: "Integration not found" }, 404);
  if (!integration.webhookUrl)
    return c.json({ error: "No webhook URL configured" }, 400);

  const success = await testWebhook(integration.type, integration.webhookUrl);
  return c.json({ success });
});

export default app;
