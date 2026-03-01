import { Hono } from "hono";
import { db } from "../db/index.js";
import { threats } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { wsManager } from "../lib/ws.js";
import { threatAnalyzer } from "../services/threat-analyzer.js";
import { getTenantContext } from "../middleware/tenant-auth.js";

const app = new Hono();

// GET /api/threats — list all threats
app.get("/", async (c) => {
  const { tenantId } = getTenantContext(c);
  const severity = c.req.query("severity");
  const status = c.req.query("status");
  const limit = Number(c.req.query("limit") || 50);

  let allThreats = await db.query.threats.findMany({
    where: eq(threats.tenantId, tenantId),
    orderBy: [desc(threats.detectedAt)],
    limit,
  });

  if (severity) {
    allThreats = allThreats.filter((t) => t.severity === severity);
  }
  if (status) {
    allThreats = allThreats.filter((t) => t.responseStatus === status);
  }

  return c.json({ threats: allThreats });
});

// GET /api/threats/:id
app.get("/:id", async (c) => {
  const { tenantId } = getTenantContext(c);
  const threat = await db.query.threats.findFirst({
    where: and(
      eq(threats.id, c.req.param("id")),
      eq(threats.tenantId, tenantId),
    ),
  });

  if (!threat) return c.json({ error: "Threat not found" }, 404);
  return c.json({ threat });
});

// PATCH /api/threats/:id — update response status (dismiss, resolve)
app.patch("/:id", async (c) => {
  const { tenantId } = getTenantContext(c);
  const id = c.req.param("id");
  const body = await c.req.json();

  const threat = await db.query.threats.findFirst({
    where: and(eq(threats.id, id), eq(threats.tenantId, tenantId)),
  });
  if (!threat) return c.json({ error: "Threat not found" }, 404);

  const updates: Record<string, unknown> = {};
  if (body.responseStatus) {
    updates.responseStatus = body.responseStatus;
    if (
      body.responseStatus === "executed" ||
      body.responseStatus === "dismissed"
    ) {
      updates.resolvedAt = new Date();
    }
  }
  if (body.responseAction) updates.responseAction = body.responseAction;

  await db.update(threats).set(updates).where(eq(threats.id, id));

  wsManager.broadcast("threat_updated", { threatId: id, ...updates });

  return c.json({ threat: { ...threat, ...updates } });
});

// GET /api/threats/:id/analysis — AI threat analysis
app.get("/:id/analysis", async (c) => {
  const id = c.req.param("id");
  const analysis = await threatAnalyzer.analyze(id);
  if (!analysis) return c.json({ error: "Threat not found" }, 404);
  return c.json({ analysis });
});

// GET /api/threats/stats/summary — aggregated threat stats
app.get("/stats/summary", async (c) => {
  const { tenantId } = getTenantContext(c);
  const allThreats = await db.query.threats.findMany({
    where: eq(threats.tenantId, tenantId),
  });

  const stats = {
    total: allThreats.length,
    bySeverity: {
      critical: allThreats.filter((t) => t.severity === "critical").length,
      high: allThreats.filter((t) => t.severity === "high").length,
      medium: allThreats.filter((t) => t.severity === "medium").length,
      low: allThreats.filter((t) => t.severity === "low").length,
      info: allThreats.filter((t) => t.severity === "info").length,
    },
    byStatus: {
      pending: allThreats.filter((t) => t.responseStatus === "pending").length,
      executed: allThreats.filter((t) => t.responseStatus === "executed")
        .length,
      dismissed: allThreats.filter((t) => t.responseStatus === "dismissed")
        .length,
      failed: allThreats.filter((t) => t.responseStatus === "failed").length,
    },
  };

  return c.json({ stats });
});

export default app;
