import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { config } from "./lib/config.js";
import { wsManager } from "./lib/ws.js";
// Indexer removed — CRE DON is now the primary event detection layer.
// Events arrive via POST /api/webhooks/cre from the CRE workflow.
import { randomUUID } from "crypto";

// Route imports
import authRoutes from "./routes/auth.js";
import vaultsRoutes from "./routes/vaults.js";
import threatsRoutes from "./routes/threats.js";
import eventsRoutes from "./routes/events.js";
import settingsRoutes from "./routes/settings.js";
import webhooksRoutes from "./routes/webhooks.js";
import simulateRoutes from "./routes/simulate.js";
import workflowsRoutes from "./routes/workflows.js";
import onboardingRoutes from "./routes/onboarding.js";

// Security middleware
import { apiKeyAuth } from "./middleware/auth.js";
import { requireAuth, getTenantContext } from "./middleware/tenant-auth.js";
import {
  generalRateLimit,
  writeRateLimit,
  simulationRateLimit,
  defenseRateLimit,
} from "./middleware/rate-limit.js";
import { auditLog, initAuditLogTable } from "./middleware/audit-log.js";

// Initialize database tables on startup
import { db } from "./db/index.js";
import {
  tenants,
  users,
  memberships,
  vaults,
  threats,
  events,
  alertRules,
  integrations,
  settings,
} from "./db/schema.js";
import { sql, eq } from "drizzle-orm";

const app = new Hono();

// ─── Middleware ──────────────────────────────────────────────────────
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      config.corsOrigin,
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "X-Webhook-Signature",
    ],
  }),
);

// ─── Public Routes (no auth required) ──────────────────────────────
app.route("/api/auth", authRoutes);

// Security: API key auth (disabled in dev if no API_KEYS env set)
// Skip auth for /api/auth/* and /api/webhooks/* routes
app.use("/api/*", async (c, next) => {
  if (
    c.req.path.startsWith("/api/auth/") ||
    c.req.path.startsWith("/api/webhooks/")
  ) {
    return next();
  }
  return apiKeyAuth(c, next);
});

// Rate limiting
app.use("/api/*", generalRateLimit);
app.use("/api/simulate/*", simulationRateLimit);
app.use("/api/vaults/*/pause", defenseRateLimit);
app.use("/api/vaults/*/unpause", defenseRateLimit);
app.use("/api/vaults/ccip/*", defenseRateLimit);

// Audit logging for all mutating operations
app.use("/api/*", auditLog);

// Tenant authentication (JWT-based) for all protected routes
// Skip for /api/auth/*, /api/webhooks/*, /api/health
app.use("/api/*", async (c, next) => {
  if (
    c.req.path.startsWith("/api/auth/") ||
    c.req.path.startsWith("/api/webhooks/") ||
    c.req.path === "/api/health"
  ) {
    return next();
  }
  return requireAuth(c, next);
});

// ─── Protected Routes (require tenant auth) ────────────────────────
app.route("/api/vaults", vaultsRoutes);
app.route("/api/threats", threatsRoutes);
app.route("/api/events", eventsRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/webhooks", webhooksRoutes);
app.route("/api/simulate", simulateRoutes);
app.route("/api/workflows", workflowsRoutes);
app.route("/api/onboarding", onboardingRoutes);

// ─── Health ─────────────────────────────────────────────────────────
const startedAt = Date.now();

app.get("/api/health", async (c) => {
  const allVaults = await db.query.vaults.findMany();
  const allThreats = await db.query.threats.findMany();
  const allEvents = await db.query.events.findMany();

  const now = Date.now();
  const oneDayAgo = now - 86_400_000;

  return c.json({
    status: "ok",
    service: "sentineldao-api",
    version: "0.2.0",
    uptime: Math.floor((now - startedAt) / 1000),
    wsClients: wsManager.count,
    security: {
      apiKeyAuth: !!process.env.API_KEYS,
      webhookHmac: !!process.env.WEBHOOK_SECRET,
      rateLimiting: true,
      auditLogging: true,
    },
    system: {
      detection: {
        engine: "CRE DON (Chainlink Runtime Environment)",
        mode: "consensus-verified",
        dataIngestion: "POST /api/webhooks/cre",
        vaultsMonitored: allVaults.length,
        chains: [...new Set(allVaults.map((v) => v.chain))],
      },
      database: {
        vaults: allVaults.length,
        events: allEvents.length,
        threats: allThreats.length,
        eventsToday: allEvents.filter(
          (e) => e.timestamp && new Date(e.timestamp).getTime() > oneDayAgo,
        ).length,
      },
      defense: {
        configured: !!config.privateKey,
        ccipConfigured: !!config.ccip.senderAddress,
      },
      cre: {
        workflowId: "sentinel-defense",
        capabilities: [
          "EVM Log Trigger (Deposit, Withdrawal, EmergencyPause)",
          "HTTP Client (webhook POST with DON consensus)",
        ],
        detectionPatterns: {
          creNative: ["Large Transfer (threshold-based)"],
          backendSupplemental: [
            "Rapid Transactions",
            "Flash Loan Pattern",
            "TVL Drain",
            "Threat Correlation",
          ],
        },
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── Overview stats (aggregated for dashboard) ──────────────────────
app.get("/api/overview", async (c) => {
  const { tenantId } = getTenantContext(c);

  const allVaults = await db.query.vaults.findMany({
    where: eq(vaults.tenantId, tenantId),
  });
  const allThreats = await db.query.threats.findMany({
    where: eq(threats.tenantId, tenantId),
  });
  const allEvents = await db.query.events.findMany({
    where: eq(events.tenantId, tenantId),
  });

  const now = Date.now();
  const oneDayAgo = now - 86_400_000;

  const eventsToday = allEvents.filter(
    (e) => e.timestamp && new Date(e.timestamp).getTime() > oneDayAgo,
  );

  return c.json({
    overview: {
      totalVaults: allVaults.length,
      activeVaults: allVaults.filter((v) => v.status === "monitoring").length,
      pausedVaults: allVaults.filter((v) => v.status === "paused").length,
      totalThreats: allThreats.length,
      pendingThreats: allThreats.filter((t) => t.responseStatus === "pending")
        .length,
      resolvedThreats: allThreats.filter((t) => t.responseStatus === "executed")
        .length,
      totalEvents: allEvents.length,
      eventsToday: eventsToday.length,
      threatsBySeverity: {
        critical: allThreats.filter((t) => t.severity === "critical").length,
        high: allThreats.filter((t) => t.severity === "high").length,
        medium: allThreats.filter((t) => t.severity === "medium").length,
        low: allThreats.filter((t) => t.severity === "low").length,
        info: allThreats.filter((t) => t.severity === "info").length,
      },
      wsClients: wsManager.count,
    },
  });
});

// ─── Database initialization ────────────────────────────────────────
async function initDatabase() {
  console.log("[DB] Initializing database...");

  // Initialize audit log table (still needed for audit middleware)
  await initAuditLogTable();

  console.log("[DB] Database ready. Tables managed by Drizzle migrations.");
}

async function seedDefaults() {
  // No default seeding - users will sign up and add their own vaults
  console.log(
    "[DB] Skipping default seeding - users will create their own accounts",
  );
}

// ─── Start server ───────────────────────────────────────────────────
async function start() {
  await initDatabase();
  await seedDefaults();

  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║   SentinelDAO API Server                      ║
  ║   http://localhost:${config.port}                      ║
  ║                                               ║
  ║   Detection: CRE DON (consensus-verified)     ║
  ║   Defense:   CCIP cross-chain pause           ║
  ║                                               ║
  ║   Routes:                                     ║
  ║   GET  /api/health                            ║
  ║   GET  /api/overview                          ║
  ║   CRUD /api/vaults                            ║
  ║   CRUD /api/threats                           ║
  ║   GET  /api/events                            ║
  ║   CRUD /api/settings                          ║
  ║   POST /api/webhooks/cre  ← CRE data ingest  ║
  ║   POST /api/simulate/attack                   ║
  ║   WS   ws://localhost:${config.port}/ws                 ║
  ╚═══════════════════════════════════════════════╝
  `);
}

// ─── Bun server with WebSocket support ──────────────────────────────
const server = Bun.serve({
  port: config.port,
  idleTimeout: 120,
  fetch(req, server) {
    // Handle WebSocket upgrade
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { id: randomUUID() },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Handle HTTP via Hono
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      wsManager.add(ws as any);
      ws.send(JSON.stringify({ type: "connected", timestamp: Date.now() }));
    },
    close(ws) {
      wsManager.remove(ws as any);
    },
    message(ws, message) {
      // Handle ping/pong
      if (message === "ping") {
        ws.send("pong");
      }
    },
  },
});

start().catch(console.error);

console.log(`[Server] Listening on http://localhost:${server.port}`);
