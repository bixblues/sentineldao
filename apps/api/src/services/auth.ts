import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, tenants, memberships } from "../db/schema.js";
import type { User, Tenant, Membership } from "../db/schema.js";

// JWT secret from env (fallback for dev only)
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d"; // 7 days

// ─── Password Hashing ───────────────────────────────────────────────────
// Using Bun's built-in password hashing (bcrypt-compatible)
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

// ─── JWT Token Generation ──────────────────────────────────────────────
interface JWTPayload {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  iat: number;
  exp: number;
}

async function generateToken(
  user: User,
  tenantId: string,
  role: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    tenantId,
    role,
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 days
  };

  // Simple JWT encoding (base64url)
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  // HMAC-SHA256 signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const encoder = new TextEncoder();
  const key = encoder.encode(JWT_SECRET);
  const data = encoder.encode(signatureInput);

  // Use Web Crypto API for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  const signatureArray = new Uint8Array(signature);
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${signatureInput}.${signatureBase64}`;
}

async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const encoder = new TextEncoder();
    const key = encoder.encode(JWT_SECRET);
    const data = encoder.encode(signatureInput);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    // Decode signature from base64url
    const signatureDecoded = Uint8Array.from(
      atob(signature.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      signatureDecoded,
      data,
    );

    if (!valid) return null;

    // Decode payload
    const payloadJson = atob(
      encodedPayload.replace(/-/g, "+").replace(/_/g, "/"),
    );
    const payload: JWTPayload = JSON.parse(payloadJson);

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch (err) {
    console.error("[Auth] Token verification failed:", err);
    return null;
  }
}

// ─── Auth Service ───────────────────────────────────────────────────────
export const authService = {
  // Register new user + create tenant (organization)
  async register(
    email: string,
    password: string,
    name: string,
    organizationName: string,
  ): Promise<{ user: User; tenant: Tenant; token: string }> {
    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (existingUser) {
      throw new Error("Email already registered");
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const userId = randomUUID();
    const userRecord = {
      id: userId,
      email: email.toLowerCase(),
      passwordHash,
      name,
      emailVerified: false,
      createdAt: new Date(),
      lastLoginAt: null,
    };

    await db.insert(users).values(userRecord);

    // Create tenant (organization)
    const tenantId = randomUUID();
    const slug = organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const tenantRecord = {
      id: tenantId,
      name: organizationName,
      slug: `${slug}-${tenantId.slice(0, 8)}`, // Ensure uniqueness
      ownerEmail: email.toLowerCase(),
      plan: "free" as const,
      status: "trial" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(tenants).values(tenantRecord);

    // Create membership (user is owner)
    const membershipId = randomUUID();
    await db.insert(memberships).values({
      id: membershipId,
      userId,
      tenantId,
      role: "owner",
      createdAt: new Date(),
    });

    // Generate JWT
    const token = await generateToken(userRecord as User, tenantId, "owner");

    return {
      user: userRecord as User,
      tenant: tenantRecord as Tenant,
      token,
    };
  },

  // Login existing user
  async login(
    email: string,
    password: string,
  ): Promise<{
    user: User;
    tenant: Tenant;
    membership: Membership;
    token: string;
  }> {
    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }

    // Get user's primary membership (first one, usually owner)
    const membership = await db.query.memberships.findFirst({
      where: eq(memberships.userId, user.id),
    });

    if (!membership) {
      throw new Error("User has no organization membership");
    }

    // Get tenant
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, membership.tenantId),
    });

    if (!tenant) {
      throw new Error("Organization not found");
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // Generate JWT
    const token = await generateToken(user, tenant.id, membership.role);

    return { user, tenant, membership, token };
  },

  // Verify JWT and get user context
  async verifyToken(token: string): Promise<{
    user: User;
    tenant: Tenant;
    membership: Membership;
  } | null> {
    const payload = await verifyToken(token);
    if (!payload) return null;

    // Get user
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.userId),
    });

    if (!user) return null;

    // Get tenant
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, payload.tenantId),
    });

    if (!tenant) return null;

    // Get membership
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, user.id),
        eq(memberships.tenantId, tenant.id),
      ),
    });

    if (!membership) return null;

    return { user, tenant, membership };
  },

  // Get user by ID
  async getUserById(userId: string): Promise<User | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    return user || null;
  },

  // Get tenant by ID
  async getTenantById(tenantId: string): Promise<Tenant | null> {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });
    return tenant || null;
  },
};
