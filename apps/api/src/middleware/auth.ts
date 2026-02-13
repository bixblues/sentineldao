import { createMiddleware } from "hono/factory";
import { createHmac, timingSafeEqual } from "crypto";

// ─── API Key Authentication ─────────────────────────────────────────
// Validates requests using Bearer token or X-API-Key header.
// Keys are stored in env as comma-separated list: API_KEYS=key1,key2
// In production, these would come from a secrets manager.

const API_KEYS = new Set(
  (process.env.API_KEYS || "").split(",").filter(Boolean),
);

// If no API keys configured, auth is disabled (dev mode)
const AUTH_ENABLED = API_KEYS.size > 0;

export const apiKeyAuth = createMiddleware(async (c, next) => {
  // Skip auth for health checks and OPTIONS
  if (
    c.req.path === "/api/health" ||
    c.req.path === "/api/webhooks/health" ||
    c.req.method === "OPTIONS"
  ) {
    return next();
  }

  // Skip if auth not configured (dev mode)
  if (!AUTH_ENABLED) {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  const apiKeyHeader = c.req.header("X-API-Key");

  let key: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    key = authHeader.slice(7);
  } else if (apiKeyHeader) {
    key = apiKeyHeader;
  }

  if (!key || !API_KEYS.has(key)) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Valid API key required. Pass via Authorization: Bearer <key> or X-API-Key header.",
      },
      401,
    );
  }

  // Attach auth info to context
  c.set("authenticated", true);
  return next();
});

// ─── HMAC Webhook Signature Verification ────────────────────────────
// CRE and external callers sign webhook payloads with HMAC-SHA256.
// The signature is sent in X-Webhook-Signature header.
// Secret is stored in env: WEBHOOK_SECRET

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const WEBHOOK_AUTH_ENABLED = WEBHOOK_SECRET.length > 0;

export function verifyWebhookSignature(
  payload: string,
  signature: string,
): boolean {
  if (!WEBHOOK_AUTH_ENABLED) return true; // dev mode

  try {
    const expected = createHmac("sha256", WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");

    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    if (sigBuffer.length !== expectedBuffer.length) return false;

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export const webhookAuth = createMiddleware(async (c, next) => {
  if (!WEBHOOK_AUTH_ENABLED) {
    return next();
  }

  const signature = c.req.header("X-Webhook-Signature");
  if (!signature) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Missing X-Webhook-Signature header",
      },
      401,
    );
  }

  // Read body as text for signature verification
  const bodyText = await c.req.text();

  if (!verifyWebhookSignature(bodyText, signature)) {
    return c.json(
      {
        error: "Forbidden",
        message: "Invalid webhook signature",
      },
      403,
    );
  }

  // Re-parse body since we consumed it
  // Store raw body for downstream handlers
  c.set("rawBody", bodyText);
  c.set("parsedBody", JSON.parse(bodyText));

  return next();
});

// ─── Generate HMAC signature (for outgoing webhooks) ────────────────
export function signPayload(payload: string): string {
  if (!WEBHOOK_SECRET) return "";
  return createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
}
