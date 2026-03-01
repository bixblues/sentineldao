import type { Context, Next } from "hono";
import { authService } from "../services/auth.js";

// ─── Tenant Context Interface ───────────────────────────────────────────
export interface TenantContext {
  userId: string;
  tenantId: string;
  role: "owner" | "admin" | "operator" | "viewer";
  email: string;
}

// ─── Tenant Auth Middleware ─────────────────────────────────────────────
// Extracts JWT from Authorization header, verifies it, and injects tenant
// context into the request. All protected routes should use this middleware.
export async function requireAuth(c: Context, next: Next) {
  try {
    // Extract token from Authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    const context = await authService.verifyToken(token);

    if (!context) {
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    // Check if tenant is active
    if (context.tenant.status === "suspended") {
      return c.json(
        { error: "Organization suspended. Please contact support." },
        403,
      );
    }

    // Inject tenant context into request
    c.set("tenantContext", {
      userId: context.user.id,
      tenantId: context.tenant.id,
      role: context.membership.role,
      email: context.user.email,
    } as TenantContext);

    return next();
  } catch (err) {
    console.error("[TenantAuth] Authentication failed:", err);
    return c.json({ error: "Authentication failed" }, 401);
  }
}

// ─── Role-based Authorization ───────────────────────────────────────────
// Checks if the user has the required role to perform an action
export function requireRole(...allowedRoles: TenantContext["role"][]) {
  return async (c: Context, next: Next) => {
    const tenantContext = c.get("tenantContext") as TenantContext | undefined;

    if (!tenantContext) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!allowedRoles.includes(tenantContext.role)) {
      return c.json(
        {
          error: "Insufficient permissions",
          required: allowedRoles,
          current: tenantContext.role,
        },
        403,
      );
    }

    return next();
  };
}

// ─── Helper: Get Tenant Context ─────────────────────────────────────────
// Utility to extract tenant context from request (after requireAuth)
export function getTenantContext(c: Context): TenantContext {
  const context = c.get("tenantContext") as TenantContext | undefined;
  if (!context) {
    throw new Error("Tenant context not found. Did you forget requireAuth?");
  }
  return context;
}
