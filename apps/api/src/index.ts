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

// Security middleware
import { apiKeyAuth } from "./middleware/auth.js";
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
  alertRules,
  integrations,
  settings,
} from "./db/schema.js";
import { sql } from "drizzle-orm";

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
// Skip auth for /api/auth/* routes
app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth/")) {
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

// ─── Protected Routes (require auth) ───────────────────────────────
app.route("/api/vaults", vaultsRoutes);
app.route("/api/threats", threatsRoutes);
app.route("/api/events", eventsRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/webhooks", webhooksRoutes);
app.route("/api/simulate", simulateRoutes);
app.route("/api/workflows", workflowsRoutes);

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
  const allVaults = await db.query.vaults.findMany();
  const allThreats = await db.query.threats.findMany();
  const allEvents = await db.query.events.findMany();

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
  console.log("[DB] Initializing database tables...");

  // Create tables if they don't exist (inline migration for simplicity)
  db.run(sql`CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    chain TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'monitoring',
    alert_threshold_eth REAL NOT NULL DEFAULT 0.1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL REFERENCES vaults(id),
    type TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    from_address TEXT,
    to_address TEXT,
    amount TEXT,
    amount_eth REAL,
    chain TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS threats (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL REFERENCES vaults(id),
    event_id TEXT REFERENCES events(id),
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    chain TEXT NOT NULL,
    tx_hash TEXT,
    amount TEXT,
    amount_eth REAL,
    response_action TEXT,
    response_status TEXT NOT NULL DEFAULT 'pending',
    response_tx_hash TEXT,
    detected_at INTEGER NOT NULL DEFAULT (unixepoch()),
    resolved_at INTEGER
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    params TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',
    response_type TEXT NOT NULL DEFAULT 'alert_only',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    webhook_url TEXT,
    api_key TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    severities TEXT DEFAULT '["critical","high"]',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  // Initialize audit log table
  initAuditLogTable();

  console.log("[DB] Tables ready.");
}

async function seedDefaults() {
  // Create demo tenant if none exist
  const existingTenants = await db.query.tenants.findMany();
  let demoTenantId: string;

  if (existingTenants.length === 0) {
    console.log("[DB] Creating demo tenant...");
    demoTenantId = randomUUID();
    await db.insert(tenants).values({
      id: demoTenantId,
      name: "Demo Organization",
      slug: "demo-org",
      ownerEmail: "demo@sentineldao.com",
      plan: "pro",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    demoTenantId = existingTenants[0].id;
  }

  // Seed default vaults if none exist (multi-chain)
  const existingVaults = await db.query.vaults.findMany();
  if (existingVaults.length === 0) {
    console.log("[DB] Seeding multi-chain vaults...");
    await db.insert(vaults).values([
      {
        id: randomUUID(),
        tenantId: demoTenantId,
        name: "Sepolia Treasury",
        address: "0xcdcc7e3d66221c22a7d2c1490120e199568fd11d",
        chain: "ethereum-sepolia",
        chainId: 11155111,
        status: "monitoring",
        alertThresholdEth: 0.1,
      },
      {
        id: randomUUID(),
        tenantId: demoTenantId,
        name: "Arbitrum Vault",
        address: "0x24ae95b0b57e07fc65c79ad133db6e398722b4a1",
        chain: "arbitrum-sepolia",
        chainId: 421614,
        status: "monitoring",
        alertThresholdEth: 0.1,
      },
      {
        id: randomUUID(),
        tenantId: demoTenantId,
        name: "Base Vault",
        address: "0x24ae95b0b57e07fc65c79ad133db6e398722b4a1",
        chain: "base-sepolia",
        chainId: 84532,
        status: "monitoring",
        alertThresholdEth: 0.1,
      },
    ]);
  }

  // Seed default alert rules if none exist
  const existingRules = await db.query.alertRules.findMany();
  if (existingRules.length === 0) {
    console.log("[DB] Seeding default alert rules...");
    await db.insert(alertRules).values([
      {
        id: randomUUID(),
        tenantId: demoTenantId,
        name: "Large Transfer Alert",
        type: "large_transfer",
        enabled: true,
        params: { thresholdEth: 0.1 },
        severity: "medium",
        responseType: "alert_only",
      },
      {
        id: randomUUID(),
        tenantId: demoTenantId,
        name: "Rapid Transaction Alert",
        type: "rapid_transactions",
        enabled: true,
        params: { maxTxnsPerMinute: 5 },
        severity: "high",
        responseType: "pause_single",
      },
      {
        id: randomUUID(),
        tenantId: demoTenantId,
        name: "Unauthorized Access Alert",
        type: "unauthorized_access",
        enabled: true,
        params: { monitoredFunctions: ["setSentinel", "transferOwnership"] },
        severity: "critical",
        responseType: "pause_all_ccip",
      },
    ]);
  }

  // Seed default settings if none exist
  const existingSettings = await db.query.settings.findMany();
  if (existingSettings.length === 0) {
    console.log("[DB] Seeding default settings...");
    const defaults = [
      { key: "auto_pause_enabled", value: true },
      { key: "cross_chain_propagation", value: true },
      { key: "ai_analysis_enabled", value: false },
      { key: "cooldown_seconds", value: 300 },
      { key: "indexer_enabled", value: true },
    ];
    for (const s of defaults) {
      await db.insert(settings).values({
        key: s.key,
        value: s.value as unknown,
      });
    }
  }
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
