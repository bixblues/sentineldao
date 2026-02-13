import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { vaults } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getVaultOnChainData } from "../services/chain-reader.js";
import { defenseExecutor } from "../services/defense-executor.js";
import { wsManager } from "../lib/ws.js";
import { randomUUID } from "crypto";

const app = new Hono();

const createVaultSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chain: z.string(),
  chainId: z.number(),
  alertThresholdEth: z.number().positive().optional().default(0.1),
});

// GET /api/vaults — list all vaults with on-chain data
app.get("/", async (c) => {
  const allVaults = await db.query.vaults.findMany({
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });

  // Enrich with on-chain data
  const enriched = await Promise.all(
    allVaults.map(async (vault) => {
      const onChain = await getVaultOnChainData(
        vault.address as `0x${string}`,
        vault.chain,
      );
      return {
        ...vault,
        onChain: onChain || {
          balance: "0",
          balanceEth: "0",
          paused: false,
          sentinel: null,
          owner: null,
        },
      };
    }),
  );

  return c.json({ vaults: enriched });
});

// GET /api/vaults/:id — single vault detail
app.get("/:id", async (c) => {
  const vault = await db.query.vaults.findFirst({
    where: eq(vaults.id, c.req.param("id")),
  });

  if (!vault) return c.json({ error: "Vault not found" }, 404);

  const onChain = await getVaultOnChainData(
    vault.address as `0x${string}`,
    vault.chain,
  );

  return c.json({
    vault: {
      ...vault,
      onChain: onChain || {
        balance: "0",
        balanceEth: "0",
        paused: false,
        sentinel: null,
        owner: null,
      },
    },
  });
});

// POST /api/vaults — register a new vault
app.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createVaultSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const { name, address, chain, chainId, alertThresholdEth } = parsed.data;

  // Check for duplicate
  const existing = await db.query.vaults.findFirst({
    where: eq(vaults.address, address.toLowerCase()),
  });

  if (existing) {
    return c.json({ error: "Vault with this address already exists" }, 409);
  }

  const vault = {
    id: randomUUID(),
    name,
    address: address.toLowerCase(),
    chain,
    chainId,
    alertThresholdEth,
    status: "monitoring" as const,
  };

  await db.insert(vaults).values(vault);

  return c.json({ vault }, 201);
});

// PATCH /api/vaults/:id — update vault
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const vault = await db.query.vaults.findFirst({ where: eq(vaults.id, id) });
  if (!vault) return c.json({ error: "Vault not found" }, 404);

  const updates: Partial<typeof vault> = {};
  if (body.name) updates.name = body.name;
  if (body.alertThresholdEth)
    updates.alertThresholdEth = body.alertThresholdEth;
  if (body.status) updates.status = body.status;

  await db
    .update(vaults)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(vaults.id, id));

  return c.json({ vault: { ...vault, ...updates } });
});

// POST /api/vaults/:id/pause — emergency pause a vault on-chain
app.post("/:id/pause", async (c) => {
  const id = c.req.param("id");
  const vault = await db.query.vaults.findFirst({ where: eq(vaults.id, id) });
  if (!vault) return c.json({ error: "Vault not found" }, 404);

  if (!defenseExecutor.isConfigured) {
    return c.json(
      { error: "Defense executor not configured (no private key)" },
      503,
    );
  }

  const result = await defenseExecutor.pauseVault(
    vault.address as `0x${string}`,
    vault.chain,
  );

  if (!result) {
    return c.json({ error: "Failed to pause vault on-chain" }, 500);
  }

  await db
    .update(vaults)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(vaults.id, id));

  wsManager.broadcast("vault_status_change", { vaultId: id, status: "paused" });

  return c.json({
    success: true,
    txHash: result.txHash,
    chain: result.chain,
    explorerUrl: getExplorerUrl(vault.chain, result.txHash),
  });
});

// POST /api/vaults/:id/unpause — unpause a vault on-chain
app.post("/:id/unpause", async (c) => {
  const id = c.req.param("id");
  const vault = await db.query.vaults.findFirst({ where: eq(vaults.id, id) });
  if (!vault) return c.json({ error: "Vault not found" }, 404);

  if (!defenseExecutor.isConfigured) {
    return c.json(
      { error: "Defense executor not configured (no private key)" },
      503,
    );
  }

  const result = await defenseExecutor.unpauseVault(
    vault.address as `0x${string}`,
    vault.chain,
  );

  if (!result) {
    return c.json({ error: "Failed to unpause vault on-chain" }, 500);
  }

  await db
    .update(vaults)
    .set({ status: "monitoring", updatedAt: new Date() })
    .where(eq(vaults.id, id));

  wsManager.broadcast("vault_status_change", {
    vaultId: id,
    status: "monitoring",
  });

  return c.json({
    success: true,
    txHash: result.txHash,
    chain: result.chain,
    explorerUrl: getExplorerUrl(vault.chain, result.txHash),
  });
});

// POST /api/vaults/ccip/pause-all — cross-chain CCIP defense: pause ALL vaults
app.post("/ccip/pause-all", async (c) => {
  if (!defenseExecutor.isConfigured) {
    return c.json(
      { error: "Defense executor not configured (no private key)" },
      503,
    );
  }

  // Find the Sepolia vault to pause locally
  const sepoliaVault = await db.query.vaults.findFirst({
    where: eq(vaults.chain, "ethereum-sepolia"),
  });

  if (!sepoliaVault) {
    return c.json({ error: "No Sepolia vault found" }, 404);
  }

  wsManager.broadcast("ccip_defense_started", {
    message: "Cross-chain defense activated — pausing all vaults via CCIP",
  });

  const result = await defenseExecutor.crossChainPauseAll(
    sepoliaVault.address as `0x${string}`,
  );

  // Update all vault statuses in DB
  const allVaults = await db.query.vaults.findMany();
  for (const v of allVaults) {
    await db
      .update(vaults)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(vaults.id, v.id));
  }

  wsManager.broadcast("ccip_defense_complete", {
    localPause: result.localPause
      ? {
          txHash: result.localPause.txHash,
          chain: result.localPause.chain,
          explorerUrl: getExplorerUrl(
            "ethereum-sepolia",
            result.localPause.txHash,
          ),
        }
      : null,
    ccipMessages: result.ccipMessages.map((msg) => ({
      ...msg,
      explorerUrl: getExplorerUrl("ethereum-sepolia", msg.txHash),
      ccipExplorerUrl: `https://ccip.chain.link/msg/${msg.messageId}`,
    })),
  });

  return c.json({
    success: true,
    localPause: result.localPause
      ? {
          txHash: result.localPause.txHash,
          chain: result.localPause.chain,
          explorerUrl: getExplorerUrl(
            "ethereum-sepolia",
            result.localPause.txHash,
          ),
        }
      : null,
    ccipMessages: result.ccipMessages.map((msg) => ({
      ...msg,
      explorerUrl: getExplorerUrl("ethereum-sepolia", msg.txHash),
      ccipExplorerUrl: `https://ccip.chain.link/msg/${msg.messageId}`,
    })),
  });
});

// GET /api/vaults/ccip/status — CCIP sender status (LINK balance, config)
app.get("/ccip/status", async (c) => {
  const linkBalance = await defenseExecutor.getCCIPSenderLinkBalance();

  return c.json({
    configured: defenseExecutor.isConfigured,
    senderAddress: process.env.CCIP_SENDER_ADDRESS || null,
    senderChain: "ethereum-sepolia",
    linkBalance,
    receivers: {
      "arbitrum-sepolia": process.env.CCIP_RECEIVER_ARB_SEPOLIA || null,
      "base-sepolia": process.env.CCIP_RECEIVER_BASE_SEPOLIA || null,
    },
  });
});

// DELETE /api/vaults/:id
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(vaults).where(eq(vaults.id, id));
  return c.json({ success: true });
});

// Helper: get explorer URL for a tx
function getExplorerUrl(chain: string, txHash: string): string {
  const explorers: Record<string, string> = {
    "ethereum-sepolia": "https://sepolia.etherscan.io",
    "arbitrum-sepolia": "https://sepolia.arbiscan.io",
    "base-sepolia": "https://sepolia.basescan.org",
  };
  const base = explorers[chain] || "https://sepolia.etherscan.io";
  return `${base}/tx/${txHash}`;
}

export default app;
