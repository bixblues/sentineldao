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
export async function initAuditLogTable() {
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      path TEXT NOT NULL,
      ip TEXT NOT NULL,
      user_agent TEXT,
      request_body TEXT,
      response_status INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

    // Index for querying recent actions
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_audit_log_path ON audit_log(path)`,
    );
  } catch (err) {
    console.error("[AuditLog] Failed to initialize audit_log table:", err);
  }
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
  setImmediate(async () => {
    try {
      await db.execute(
        sql`INSERT INTO audit_log (id, path, ip, request_body, response_status, duration_ms, timestamp)
            VALUES (${randomUUID()}, ${c.req.path}, ${ip}, ${requestBody}, ${c.res.status}, ${durationMs}, NOW())`,
      );
    } catch (err) {
      console.error("[AuditLog] Failed to write audit entry:", err);
    }
  });
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
export async function getRecentAuditEntries(limit = 50): Promise<AuditEntry[]> {
  const result = await db.execute(
    sql`SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ${limit}`,
  );

  return (result as any[]).map((r) => ({
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
