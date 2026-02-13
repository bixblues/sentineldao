import { db } from "./index.js";
import { vaults, alertRules, integrations, settings } from "./schema.js";
import { randomUUID } from "crypto";

const VAULT_ADDRESS = "0x28281051a57d2769641b043A0f150a2A9D7e96e2";

async function seed() {
  console.log("Seeding database...");

  // Seed default vault (our deployed contract)
  await db.insert(vaults).values({
    id: randomUUID(),
    name: "Primary Treasury",
    address: VAULT_ADDRESS.toLowerCase(),
    chain: "ethereum-sepolia",
    chainId: 11155111,
    status: "monitoring",
    alertThresholdEth: 0.1,
  }).onConflictDoNothing();

  // Seed default alert rules
  await db.insert(alertRules).values([
    {
      id: randomUUID(),
      name: "Large Transfer Alert",
      type: "large_transfer",
      enabled: true,
      params: { thresholdEth: 0.1 },
      severity: "medium",
      responseType: "alert_only",
    },
    {
      id: randomUUID(),
      name: "Rapid Transaction Alert",
      type: "rapid_transactions",
      enabled: true,
      params: { maxTxnsPerMinute: 5 },
      severity: "high",
      responseType: "pause_single",
    },
    {
      id: randomUUID(),
      name: "Unauthorized Access Alert",
      type: "unauthorized_access",
      enabled: true,
      params: { monitoredFunctions: ["setSentinel", "transferOwnership"] },
      severity: "critical",
      responseType: "pause_all_ccip",
    },
  ]).onConflictDoNothing();

  // Seed default integration (Slack placeholder)
  await db.insert(integrations).values({
    id: randomUUID(),
    type: "slack",
    name: "Slack Alerts",
    webhookUrl: "",
    enabled: false,
    severities: ["critical", "high"],
  }).onConflictDoNothing();

  // Seed default settings
  const defaultSettings = [
    { key: "auto_pause_enabled", value: true },
    { key: "cross_chain_propagation", value: true },
    { key: "ai_analysis_enabled", value: false },
    { key: "cooldown_seconds", value: 300 },
    { key: "indexer_enabled", value: true },
  ];

  for (const s of defaultSettings) {
    await db.insert(settings).values({
      key: s.key,
      value: s.value as unknown,
    }).onConflictDoNothing();
  }

  console.log("Seed complete.");
}

seed().catch(console.error);
