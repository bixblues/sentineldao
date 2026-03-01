import { Hono } from "hono";
import { db } from "../db/index.js";
import { events } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { getTenantContext } from "../middleware/tenant-auth.js";

const app = new Hono();

// GET /api/events — list all events
app.get("/", async (c) => {
  const { tenantId } = getTenantContext(c);
  const vaultId = c.req.query("vaultId");
  const type = c.req.query("type");
  const limit = Number(c.req.query("limit") || 100);

  let allEvents = await db.query.events.findMany({
    where: eq(events.tenantId, tenantId),
    orderBy: [desc(events.timestamp)],
    limit,
  });

  if (vaultId) {
    allEvents = allEvents.filter((e) => e.vaultId === vaultId);
  }
  if (type) {
    allEvents = allEvents.filter((e) => e.type === type);
  }

  return c.json({ events: allEvents });
});

// GET /api/events/stats — event statistics
app.get("/stats", async (c) => {
  const { tenantId } = getTenantContext(c);
  const allEvents = await db.query.events.findMany({
    where: eq(events.tenantId, tenantId),
  });

  const now = Date.now();
  const oneDayAgo = now - 86_400_000;
  const oneWeekAgo = now - 7 * 86_400_000;

  const today = allEvents.filter(
    (e) => e.timestamp && new Date(e.timestamp).getTime() > oneDayAgo,
  );
  const thisWeek = allEvents.filter(
    (e) => e.timestamp && new Date(e.timestamp).getTime() > oneWeekAgo,
  );

  return c.json({
    stats: {
      total: allEvents.length,
      today: today.length,
      thisWeek: thisWeek.length,
      byType: {
        deposit: allEvents.filter((e) => e.type === "deposit").length,
        withdrawal: allEvents.filter((e) => e.type === "withdrawal").length,
        pause: allEvents.filter((e) => e.type === "pause").length,
        unpause: allEvents.filter((e) => e.type === "unpause").length,
      },
    },
  });
});

export default app;
