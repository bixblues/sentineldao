import {
  pgTable,
  text,
  timestamp,
  boolean,
  doublePrecision,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

// ─── Tenants (Organizations) ────────────────────────────────────────
export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(), // uuid
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  ownerEmail: text("owner_email").notNull(),
  plan: text("plan", { enum: ["free", "pro", "enterprise"] })
    .notNull()
    .default("free"),
  status: text("status", { enum: ["active", "suspended", "trial"] })
    .notNull()
    .default("trial"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Users ──────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(), // uuid
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

// ─── Memberships (Users ↔ Tenants) ─────────────────────────────────
export const memberships = pgTable("memberships", {
  id: text("id").primaryKey(), // uuid
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "admin", "operator", "viewer"] })
    .notNull()
    .default("viewer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Vaults ──────────────────────────────────────────────────────────
export const vaults = pgTable("vaults", {
  id: text("id").primaryKey(), // uuid
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address").notNull(),
  chain: text("chain").notNull(), // e.g. "ethereum-sepolia"
  chainId: integer("chain_id").notNull(),
  status: text("status", { enum: ["monitoring", "paused", "pending"] })
    .notNull()
    .default("monitoring"),
  alertThresholdEth: doublePrecision("alert_threshold_eth")
    .notNull()
    .default(0.1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Activity Log (on-chain events) ─────────────────────────────────
export const events = pgTable("events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
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
  amountEth: doublePrecision("amount_eth"), // parsed ETH value
  chain: text("chain").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// ─── Threat Events ──────────────────────────────────────────────────
export const threats = pgTable("threats", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
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
  amountEth: doublePrecision("amount_eth"),
  responseAction: text("response_action"), // what was done
  responseStatus: text("response_status", {
    enum: ["pending", "executed", "dismissed", "failed"],
  })
    .notNull()
    .default("pending"),
  responseTxHash: text("response_tx_hash"), // tx of the defense action
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// ─── Alert Rules ────────────────────────────────────────────────────
export const alertRules = pgTable("alert_rules", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", {
    enum: [
      "large_transfer",
      "rapid_transactions",
      "unauthorized_access",
      "custom",
    ],
  }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  // Rule parameters (JSON)
  params: jsonb("params").$type<{
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Integrations ───────────────────────────────────────────────────
export const integrations = pgTable("integrations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["slack", "discord", "pagerduty", "telegram", "custom_webhook"],
  }).notNull(),
  name: text("name").notNull(),
  webhookUrl: text("webhook_url"),
  apiKey: text("api_key"),
  enabled: boolean("enabled").notNull().default(true),
  // Which severities trigger this integration
  severities: jsonb("severities")
    .$type<string[]>()
    .default(["critical", "high"]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Global Settings ────────────────────────────────────────────────
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Type exports ───────────────────────────────────────────────────
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
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
