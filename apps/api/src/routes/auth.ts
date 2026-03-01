import { Hono } from "hono";
import { z } from "zod";
import { authService } from "../services/auth.js";

const app = new Hono();

// ─── Validation Schemas ─────────────────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  organizationName: z.string().min(1, "Organization name is required"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

// ─── POST /auth/register ────────────────────────────────────────────────
// Register new user + create organization
app.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Validation failed",
          details: parsed.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        400,
      );
    }

    const { email, password, name, organizationName } = parsed.data;

    const result = await authService.register(
      email,
      password,
      name,
      organizationName,
    );

    return c.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
        plan: result.tenant.plan,
      },
      token: result.token,
    });
  } catch (err: any) {
    console.error("[Auth] Registration failed:", err);
    return c.json(
      {
        error: err.message || "Registration failed",
      },
      400,
    );
  }
});

// ─── POST /auth/login ───────────────────────────────────────────────────
// Login existing user
app.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Validation failed",
          details: parsed.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        400,
      );
    }

    const { email, password } = parsed.data;

    const result = await authService.login(email, password);

    return c.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
        plan: result.tenant.plan,
      },
      membership: {
        role: result.membership.role,
      },
      token: result.token,
    });
  } catch (err: any) {
    console.error("[Auth] Login failed:", err);
    return c.json(
      {
        error: err.message || "Login failed",
      },
      401,
    );
  }
});

// ─── GET /auth/me ───────────────────────────────────────────────────────
// Get current user info (requires auth)
app.get("/me", async (c) => {
  try {
    // Extract token from Authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "No token provided" }, 401);
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    const context = await authService.verifyToken(token);

    if (!context) {
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    return c.json({
      user: {
        id: context.user.id,
        email: context.user.email,
        name: context.user.name,
        emailVerified: context.user.emailVerified,
      },
      tenant: {
        id: context.tenant.id,
        name: context.tenant.name,
        slug: context.tenant.slug,
        plan: context.tenant.plan,
        status: context.tenant.status,
      },
      membership: {
        role: context.membership.role,
      },
    });
  } catch (err: any) {
    console.error("[Auth] /me failed:", err);
    return c.json({ error: "Authentication failed" }, 401);
  }
});

// ─── POST /auth/logout ──────────────────────────────────────────────────
// Logout (client-side token deletion, no server action needed for JWT)
app.post("/logout", async (c) => {
  return c.json({ success: true, message: "Logged out successfully" });
});

export default app;
