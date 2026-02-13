import { createMiddleware } from "hono/factory";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Audit Log Middleware ───────────────────────────────────────────
// Records all mutating API actions (POST, PUT, PATCH, DELETE) with
// request details, response status, and timing for forensic analysis.

export interface AuditEntry {
  id: string;
  action: string; // HTTP method
  path: string;
  ip: string;
  userAgent: string;
  requestBody: string | null;
  responseStatus: number;
  durationMs: number;
  timestamp: string;
}

// Ensure audit_log table exists
export function initAuditLogTable() {
  db.run(sql`CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    path TEXT NOT NULL,
    ip TEXT NOT NULL,
    user_agent TEXT,
    request_body TEXT,
    response_status INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Index for querying recent actions
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_audit_log_path ON audit_log(path)`,
  );
}

export const auditLog = createMiddleware(async (c, next) => {
  // Only log mutating operations
  const method = c.req.method;
  if (method === "GET" || method === "OPTIONS" || method === "HEAD") {
    return next();
  }

  // Skip health checks
  if (c.req.path === "/api/health" || c.req.path === "/api/webhooks/health") {
    return next();
  }

  const startTime = Date.now();
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";
  const userAgent = c.req.header("user-agent") || "";

  // Capture request body (truncated to 2KB for storage)
  let requestBody: string | null = null;
  try {
    const cloned = c.req.raw.clone();
    const text = await cloned.text();
    if (text) {
      // Redact sensitive fields
      requestBody = redactSensitive(text).slice(0, 2048);
    }
  } catch {
    // Body may not be readable
  }

  await next();

  const durationMs = Date.now() - startTime;

  // Write audit entry asynchronously (don't block response)
  try {
    db.run(
      sql`INSERT INTO audit_log (id, action, path, ip, user_agent, request_body, response_status, duration_ms, timestamp)
          VALUES (${randomUUID()}, ${method}, ${c.req.path}, ${ip}, ${userAgent}, ${requestBody}, ${c.res.status}, ${durationMs}, ${new Date().toISOString()})`,
    );
  } catch (err) {
    console.error("[AuditLog] Failed to write audit entry:", err);
  }
});

// Redact sensitive fields from request bodies
function redactSensitive(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const sensitiveKeys = [
      "password",
      "secret",
      "apiKey",
      "api_key",
      "privateKey",
      "private_key",
      "token",
    ];
    for (const key of sensitiveKeys) {
      if (key in parsed) {
        parsed[key] = "[REDACTED]";
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

// ─── Query audit log ────────────────────────────────────────────────
export function getRecentAuditEntries(limit = 50): AuditEntry[] {
  const rows = db
    .all(
      sql`SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ${limit}`,
    ) as any[];

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    path: r.path,
    ip: r.ip,
    userAgent: r.user_agent,
    requestBody: r.request_body,
    responseStatus: r.response_status,
    durationMs: r.duration_ms,
    timestamp: r.timestamp,
  }));
}
