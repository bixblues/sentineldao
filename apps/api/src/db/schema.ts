import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Vaults ──────────────────────────────────────────────────────────
export const vaults = sqliteTable("vaults", {
  id: text("id").primaryKey(), // uuid
  name: text("name").notNull(),
  address: text("address").notNull(),
  chain: text("chain").notNull(), // e.g. "ethereum-sepolia"
  chainId: integer("chain_id").notNull(),
  status: text("status", { enum: ["monitoring", "paused", "pending"] })
    .notNull()
    .default("monitoring"),
  alertThresholdEth: real("alert_threshold_eth").notNull().default(0.1),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Activity Log (on-chain events) ─────────────────────────────────
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  vaultId: text("vault_id")
    .notNull()
    .references(() => vaults.id),
  type: text("type", {
    enum: ["deposit", "withdrawal", "pause", "unpause", "sentinel_updated"],
  }).notNull(),
  txHash: text("tx_hash").notNull(),
  blockNumber: integer("block_number").notNull(),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  amount: text("amount"), // wei string
  amountEth: real("amount_eth"), // parsed ETH value
  chain: text("chain").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Threat Events ──────────────────────────────────────────────────
export const threats = sqliteTable("threats", {
  id: text("id").primaryKey(),
  vaultId: text("vault_id")
    .notNull()
    .references(() => vaults.id),
  eventId: text("event_id").references(() => events.id),
  type: text("type").notNull(), // e.g. "large_transfer", "rapid_transactions", "unauthorized_access"
  severity: text("severity", {
    enum: ["critical", "high", "medium", "low", "info"],
  }).notNull(),
  description: text("description").notNull(),
  chain: text("chain").notNull(),
  txHash: text("tx_hash"),
  amount: text("amount"),
  amountEth: real("amount_eth"),
  responseAction: text("response_action"), // what was done
  responseStatus: text("response_status", {
    enum: ["pending", "executed", "dismissed", "failed"],
  })
    .notNull()
    .default("pending"),
  responseTxHash: text("response_tx_hash"), // tx of the defense action
  detectedAt: integer("detected_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

// ─── Alert Rules ────────────────────────────────────────────────────
export const alertRules = sqliteTable("alert_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", {
    enum: [
      "large_transfer",
      "rapid_transactions",
      "unauthorized_access",
      "custom",
    ],
  }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  // Rule parameters (JSON)
  params: text("params", { mode: "json" }).$type<{
    thresholdEth?: number;
    maxTxnsPerMinute?: number;
    monitoredFunctions?: string[];
    customCondition?: string;
  }>(),
  severity: text("severity", {
    enum: ["critical", "high", "medium", "low"],
  })
    .notNull()
    .default("medium"),
  responseType: text("response_type", {
    enum: ["alert_only", "pause_single", "pause_all_ccip"],
  })
    .notNull()
    .default("alert_only"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Integrations ───────────────────────────────────────────────────
export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  type: text("type", {
    enum: ["slack", "discord", "pagerduty", "telegram", "custom_webhook"],
  }).notNull(),
  name: text("name").notNull(),
  webhookUrl: text("webhook_url"),
  apiKey: text("api_key"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  // Which severities trigger this integration
  severities: text("severities", { mode: "json" })
    .$type<string[]>()
    .default(["critical", "high"]),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Global Settings ────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Type exports ───────────────────────────────────────────────────
export type Vault = typeof vaults.$inferSelect;
export type NewVault = typeof vaults.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Threat = typeof threats.$inferSelect;
export type NewThreat = typeof threats.$inferInsert;
export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
