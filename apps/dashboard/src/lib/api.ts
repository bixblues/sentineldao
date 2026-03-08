const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";

// ─── Generic fetch wrapper ──────────────────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // Get token from localStorage
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("sentinel_token")
      : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

// ─── Types ──────────────────────────────────────────────────────────
export interface OnChainData {
  balance: string;
  balanceEth: string;
  paused: boolean;
  sentinel: string | null;
  owner: string | null;
}

export interface Vault {
  id: string;
  name: string;
  address: string;
  chain: string;
  chainId: number;
  status: "monitoring" | "paused" | "pending";
  alertThresholdEth: number;
  createdAt: string;
  updatedAt: string;
  onChain: OnChainData;
}

export interface ThreatEvent {
  id: string;
  vaultId: string;
  eventId: string | null;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  chain: string;
  txHash: string | null;
  amount: string | null;
  amountEth: number | null;
  responseAction: string | null;
  responseStatus: "pending" | "executed" | "dismissed" | "failed";
  responseTxHash: string | null;
  detectedAt: string;
  resolvedAt: string | null;
}

export interface ActivityEvent {
  id: string;
  vaultId: string;
  type: "deposit" | "withdrawal" | "pause" | "unpause" | "sentinel_updated";
  txHash: string;
  blockNumber: number;
  fromAddress: string | null;
  toAddress: string | null;
  amount: string | null;
  amountEth: number | null;
  chain: string;
  timestamp: string;
}

export interface AlertRule {
  id: string;
  name: string;
  type:
    | "large_transfer"
    | "rapid_transactions"
    | "unauthorized_access"
    | "custom";
  enabled: boolean;
  params: Record<string, unknown> | null;
  severity: "critical" | "high" | "medium" | "low";
  responseType: "alert_only" | "pause_single" | "pause_all_ccip";
  createdAt: string;
}

export interface Integration {
  id: string;
  type: "slack" | "discord" | "pagerduty" | "telegram" | "custom_webhook";
  name: string;
  webhookUrl: string | null;
  apiKey: string | null;
  enabled: boolean;
  severities: string[];
  createdAt: string;
}

export interface OverviewData {
  totalVaults: number;
  activeVaults: number;
  pausedVaults: number;
  totalThreats: number;
  pendingThreats: number;
  resolvedThreats: number;
  totalEvents: number;
  eventsToday: number;
  threatsBySeverity: Record<string, number>;
  wsClients: number;
}

// ─── API Methods ────────────────────────────────────────────────────

// Overview
export const api = {
  // Health
  health: () =>
    apiFetch<{
      status: string;
      service: string;
      version: string;
      uptime: number;
      wsClients: number;
      security: {
        apiKeyAuth: boolean;
        webhookHmac: boolean;
        rateLimiting: boolean;
        auditLogging: boolean;
      };
      system: {
        detection: {
          engine: string;
          mode: string;
          dataIngestion: string;
          vaultsMonitored: number;
          chains: string[];
        };
        database: {
          vaults: number;
          events: number;
          threats: number;
          eventsToday: number;
        };
        defense: { configured: boolean; ccipConfigured: boolean };
        cre: {
          workflowId: string;
          capabilities: string[];
          detectionPatterns: {
            creNative: string[];
            backendSupplemental: string[];
          };
        };
      };
      timestamp: string;
    }>("/api/health"),

  // Overview
  getOverview: () => apiFetch<{ overview: OverviewData }>("/api/overview"),

  // Vaults
  getVaults: () => apiFetch<{ vaults: Vault[] }>("/api/vaults"),
  getVault: (id: string) => apiFetch<{ vault: Vault }>(`/api/vaults/${id}`),
  createVault: (data: {
    name: string;
    address: string;
    chain: string;
    chainId: number;
    alertThresholdEth?: number;
  }) =>
    apiFetch<{ vault: Vault }>("/api/vaults", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateVault: (id: string, data: Partial<Vault>) =>
    apiFetch<{ vault: Vault }>(`/api/vaults/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteVault: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/vaults/${id}`, { method: "DELETE" }),
  pauseVault: (id: string) =>
    apiFetch<{
      success: boolean;
      txHash: string;
      chain: string;
      explorerUrl: string;
    }>(`/api/vaults/${id}/pause`, { method: "POST" }),
  unpauseVault: (id: string) =>
    apiFetch<{
      success: boolean;
      txHash: string;
      chain: string;
      explorerUrl: string;
    }>(`/api/vaults/${id}/unpause`, { method: "POST" }),

  // CCIP Cross-Chain Defense
  ccipPauseAll: () =>
    apiFetch<{
      success: boolean;
      localPause: { txHash: string; chain: string; explorerUrl: string } | null;
      ccipMessages: Array<{
        txHash: string;
        messageId: string;
        chain: string;
        fees: string;
        explorerUrl: string;
        ccipExplorerUrl: string;
      }>;
    }>("/api/vaults/ccip/pause-all", { method: "POST" }),
  getCCIPStatus: () =>
    apiFetch<{
      configured: boolean;
      senderAddress: string | null;
      senderChain: string;
      linkBalance: string;
      receivers: Record<string, string | null>;
    }>("/api/vaults/ccip/status"),

  // Threats
  getThreats: (params?: {
    severity?: string;
    status?: string;
    limit?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.severity) search.set("severity", params.severity);
    if (params?.status) search.set("status", params.status);
    if (params?.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return apiFetch<{ threats: ThreatEvent[] }>(
      `/api/threats${qs ? `?${qs}` : ""}`,
    );
  },
  updateThreat: (
    id: string,
    data: { responseStatus?: string; responseAction?: string },
  ) =>
    apiFetch<{ threat: ThreatEvent }>(`/api/threats/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Events
  getEvents: (params?: { vaultId?: string; type?: string; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.vaultId) search.set("vaultId", params.vaultId);
    if (params?.type) search.set("type", params.type);
    if (params?.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return apiFetch<{ events: ActivityEvent[] }>(
      `/api/events${qs ? `?${qs}` : ""}`,
    );
  },
  getEventStats: () =>
    apiFetch<{
      stats: {
        total: number;
        today: number;
        thisWeek: number;
        byType: Record<string, number>;
      };
    }>("/api/events/stats"),

  // Settings
  getSettings: () =>
    apiFetch<{ settings: Record<string, unknown> }>("/api/settings"),
  updateSetting: (key: string, value: unknown) =>
    apiFetch<{ key: string; value: unknown }>(`/api/settings/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),

  // Alert Rules
  getRules: () => apiFetch<{ rules: AlertRule[] }>("/api/settings/rules"),
  createRule: (data: Partial<AlertRule>) =>
    apiFetch<{ rule: AlertRule }>("/api/settings/rules", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateRule: (id: string, data: Partial<AlertRule>) =>
    apiFetch<{ rule: AlertRule }>(`/api/settings/rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteRule: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/settings/rules/${id}`, {
      method: "DELETE",
    }),

  // Integrations
  getIntegrations: () =>
    apiFetch<{ integrations: Integration[] }>("/api/settings/integrations"),
  createIntegration: (data: Partial<Integration>) =>
    apiFetch<{ integration: Integration }>("/api/settings/integrations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateIntegration: (id: string, data: Partial<Integration>) =>
    apiFetch<{ integration: Integration }>(`/api/settings/integrations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteIntegration: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/settings/integrations/${id}`, {
      method: "DELETE",
    }),
  testIntegration: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/settings/integrations/${id}/test`, {
      method: "POST",
    }),

  // Threat Analysis
  getThreatAnalysis: (id: string) =>
    apiFetch<{ analysis: any }>(`/api/threats/${id}/analysis`),

  // Workflows
  getWorkflows: () => apiFetch<{ workflows: any[] }>("/api/workflows"),
  getWorkflowExecutions: (id: string, limit?: number) =>
    apiFetch<{ executions: any[]; total: number }>(
      `/api/workflows/${id}/executions${limit ? `?limit=${limit}` : ""}`,
    ),

  // Audit Log
  getAuditLog: (limit?: number) =>
    apiFetch<{ entries: any[]; total: number }>(
      `/api/webhooks/audit-log${limit ? `?limit=${limit}` : ""}`,
    ),

  // Simulate
  simulateAttack: (data: { type: string; vaultId?: string; count?: number }) =>
    apiFetch<{
      success: boolean;
      txHash?: string;
      txHashes?: string[];
      amount?: string;
      message: string;
    }>("/api/simulate/attack", { method: "POST", body: JSON.stringify(data) }),
  getSimulatorBalance: () =>
    apiFetch<{ address: string; balance: string; chain: string }>(
      "/api/simulate/balance",
    ),

  // CCIP Configuration
  getCCIPConfig: () =>
    apiFetch<{
      ccipSenderAddress: string | null;
      ccipReceiverArbitrum: string | null;
      ccipReceiverBase: string | null;
      ccipEnabled: boolean;
    }>("/api/settings/ccip"),
  updateCCIPConfig: (data: {
    ccipSenderAddress?: string;
    ccipReceiverArbitrum?: string;
    ccipReceiverBase?: string;
    ccipEnabled: boolean;
  }) =>
    apiFetch<{ success: boolean; config: any }>("/api/settings/ccip", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Onboarding
  getOnboardingStatus: () =>
    apiFetch<{
      onboardingCompleted: boolean;
      onboardingStep: string;
      walletAddress: string | null;
      vaultCount: number;
      ccipConfigured: boolean;
      ccipSenderAddress: string | null;
      ccipReceiverArbitrum: string | null;
      ccipReceiverBase: string | null;
    }>("/api/onboarding/status"),

  updateOnboardingStep: (data: { step: string; walletAddress?: string }) =>
    apiFetch<{ success: boolean; step: string }>("/api/onboarding/step", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  skipOnboarding: () =>
    apiFetch<{ success: boolean }>("/api/onboarding/skip", {
      method: "POST",
    }),

  registerVault: (data: {
    name: string;
    address: string;
    chain: string;
    chainId: number;
    txHash?: string;
  }) =>
    apiFetch<{ success: boolean; vault: any }>(
      "/api/onboarding/register-vault",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),

  registerCCIP: (data: {
    senderAddress?: string;
    receiverArbitrum?: string;
    receiverBase?: string;
    enabled?: boolean;
  }) =>
    apiFetch<{ success: boolean; ccip: any }>("/api/onboarding/register-ccip", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ─── WebSocket ──────────────────────────────────────────────────────
export type WSMessage = {
  type:
    | "connected"
    | "new_event"
    | "new_threat"
    | "threat_updated"
    | "threat_resolved"
    | "vault_status_change"
    | "cre_callback"
    | "simulation_started"
    | "simulation_step"
    | "simulation_error"
    | "ccip_defense_started"
    | "ccip_defense_complete";
  payload?: unknown;
  data?: unknown;
  timestamp?: number;
};

export function createWSConnection(
  onMessage: (msg: WSMessage) => void,
): WebSocket | null {
  if (typeof window === "undefined") return null;

  const ws = new WebSocket(`${WS_BASE}/ws`);

  ws.onopen = () => {
    console.log("[WS] Connected to SentinelDAO API");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as WSMessage;
      onMessage(msg);
    } catch {
      // ignore non-JSON messages
    }
  };

  ws.onclose = () => {
    console.log("[WS] Disconnected, reconnecting in 3s...");
    setTimeout(() => createWSConnection(onMessage), 3000);
  };

  ws.onerror = () => {
    // Suppress — tab switches and network blips cause benign WS errors.
    // Reconnection is handled by onclose.
  };

  return ws;
}
