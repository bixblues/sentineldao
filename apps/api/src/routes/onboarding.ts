import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { tenants, vaults } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { getTenantContext } from "../middleware/tenant-auth.js";
import { randomUUID } from "crypto";

const app = new Hono();

// ─── Get Onboarding Status ──────────────────────────────────────────
app.get("/status", async (c) => {
  const { tenantId } = getTenantContext(c);

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  // Get vault count
  const tenantVaults = await db.query.vaults.findMany({
    where: eq(vaults.tenantId, tenantId),
  });

  // If onboarding fields are null (old tenants), initialize them
  if (tenant.onboardingStep === null || tenant.onboardingStep === undefined) {
    await db
      .update(tenants)
      .set({
        onboardingStep: "welcome",
        onboardingCompleted: false,
      })
      .where(eq(tenants.id, tenantId));
  }

  return c.json({
    onboardingCompleted: tenant.onboardingCompleted || false,
    onboardingStep: tenant.onboardingStep || "welcome",
    walletAddress: tenant.walletAddress,
    vaultCount: tenantVaults.length,
    ccipConfigured: tenant.ccipEnabled,
    ccipSenderAddress: tenant.ccipSenderAddress,
    ccipReceiverArbitrum: tenant.ccipReceiverArbitrum,
    ccipReceiverBase: tenant.ccipReceiverBase,
  });
});

// ─── Update Onboarding Step ─────────────────────────────────────────
const updateStepSchema = z.object({
  step: z.enum([
    "welcome",
    "connect_wallet",
    "deploy_vaults",
    "setup_ccip",
    "complete",
  ]),
  walletAddress: z.string().optional(),
});

app.put("/step", async (c) => {
  const { tenantId } = getTenantContext(c);
  const body = await c.req.json();

  const parsed = updateStepSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const updateData: Record<string, unknown> = {
    onboardingStep: parsed.data.step,
    updatedAt: new Date(),
  };

  if (parsed.data.walletAddress) {
    updateData.walletAddress = parsed.data.walletAddress;
  }

  if (parsed.data.step === "complete") {
    updateData.onboardingCompleted = true;
  }

  await db.update(tenants).set(updateData).where(eq(tenants.id, tenantId));

  return c.json({ success: true, step: parsed.data.step });
});

// ─── Skip Onboarding ────────────────────────────────────────────────
app.post("/skip", async (c) => {
  const { tenantId } = getTenantContext(c);

  await db
    .update(tenants)
    .set({
      onboardingCompleted: true,
      onboardingStep: "complete",
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  return c.json({ success: true });
});

// ─── Register Deployed Vault ────────────────────────────────────────
const registerVaultSchema = z.object({
  name: z.string().min(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chain: z.enum(["ethereum-sepolia", "arbitrum-sepolia", "base-sepolia"]),
  chainId: z.number(),
  txHash: z.string().optional(),
});

app.post("/register-vault", async (c) => {
  const { tenantId } = getTenantContext(c);
  const body = await c.req.json();

  const parsed = registerVaultSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  // Check if vault already exists on this chain
  const existing = await db.query.vaults.findFirst({
    where: and(
      eq(vaults.address, parsed.data.address.toLowerCase()),
      eq(vaults.chain, parsed.data.chain),
      eq(vaults.tenantId, tenantId),
    ),
  });

  if (existing) {
    return c.json({
      success: true,
      vault: existing,
      message: "Vault already registered",
    });
  }

  const vault = {
    id: randomUUID(),
    tenantId,
    name: parsed.data.name,
    address: parsed.data.address.toLowerCase(),
    chain: parsed.data.chain,
    chainId: parsed.data.chainId,
    status: "monitoring" as const,
    alertThresholdEth: 0.1,
  };

  await db.insert(vaults).values(vault);

  return c.json({ success: true, vault });
});

// ─── Register CCIP Contracts ────────────────────────────────────────
const registerCCIPSchema = z.object({
  senderAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  receiverArbitrum: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  receiverBase: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  enabled: z.boolean().optional(),
});

app.post("/register-ccip", async (c) => {
  const { tenantId } = getTenantContext(c);
  const body = await c.req.json();

  const parsed = registerCCIPSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.data.senderAddress) {
    updateData.ccipSenderAddress = parsed.data.senderAddress;
  }
  if (parsed.data.receiverArbitrum) {
    updateData.ccipReceiverArbitrum = parsed.data.receiverArbitrum;
  }
  if (parsed.data.receiverBase) {
    updateData.ccipReceiverBase = parsed.data.receiverBase;
  }
  if (parsed.data.enabled !== undefined) {
    updateData.ccipEnabled = parsed.data.enabled;
  }

  await db.update(tenants).set(updateData).where(eq(tenants.id, tenantId));

  const updatedTenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  return c.json({
    success: true,
    ccip: {
      senderAddress: updatedTenant?.ccipSenderAddress,
      receiverArbitrum: updatedTenant?.ccipReceiverArbitrum,
      receiverBase: updatedTenant?.ccipReceiverBase,
      enabled: updatedTenant?.ccipEnabled,
    },
  });
});

// ─── Get Contract Bytecode for Deployment ───────────────────────────
app.get("/contract-bytecode/:type", async (c) => {
  const type = c.req.param("type");

  // These are the compiled contract bytecodes
  // In production, you'd load these from the compiled artifacts
  const bytecodes: Record<string, { bytecode: string; abi: unknown[] }> = {
    vault: {
      bytecode: "0x", // Will be loaded from compiled contracts
      abi: [],
    },
    ccipSender: {
      bytecode: "0x",
      abi: [],
    },
    ccipReceiver: {
      bytecode: "0x",
      abi: [],
    },
  };

  if (!bytecodes[type]) {
    return c.json({ error: "Unknown contract type" }, 404);
  }

  return c.json(bytecodes[type]);
});

export default app;
