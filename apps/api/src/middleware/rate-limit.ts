import { createMiddleware } from "hono/factory";

// ─── In-Memory Rate Limiter ─────────────────────────────────────────
// Sliding window rate limiter using IP address as key.
// In production, this would use Redis for distributed rate limiting.

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 60_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 60_000);

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix?: string; // Prefix for the rate limit key
}

function createRateLimiter(config: RateLimitConfig) {
  return createMiddleware(async (c, next) => {
    // Skip rate limiting for health checks
    if (c.req.path === "/api/health") return next();

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "unknown";

    const key = `${config.keyPrefix || "global"}:${ip}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(
      (t) => now - t < config.windowMs,
    );

    if (entry.timestamps.length >= config.maxRequests) {
      const retryAfter = Math.ceil(
        (entry.timestamps[0] + config.windowMs - now) / 1000,
      );

      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(config.maxRequests));
      c.header("X-RateLimit-Remaining", "0");
      c.header(
        "X-RateLimit-Reset",
        String(Math.ceil((entry.timestamps[0] + config.windowMs) / 1000)),
      );

      return c.json(
        {
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again in ${retryAfter}s.`,
          retryAfter,
        },
        429,
      );
    }

    entry.timestamps.push(now);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header(
      "X-RateLimit-Remaining",
      String(config.maxRequests - entry.timestamps.length),
    );

    return next();
  });
}

// ─── Pre-configured limiters ────────────────────────────────────────

// General API: 100 requests per minute
export const generalRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 100,
  keyPrefix: "api",
});

// Write operations (POST/PUT/PATCH/DELETE): 30 per minute
export const writeRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "write",
});

// Webhook endpoint: 60 per minute (CRE may send bursts)
export const webhookRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  keyPrefix: "webhook",
});

// Simulation endpoint: 5 per minute (expensive on-chain txns)
export const simulationRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
  keyPrefix: "simulate",
});

// Defense actions (pause/unpause/CCIP): 10 per minute
export const defenseRateLimit = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  keyPrefix: "defense",
});
