import { VAULT_ADDRESS, type ThreatSeverity } from "./constants";

export interface Vault {
  id: string;
  name: string;
  address: string;
  chain: string;
  chainColor: string;
  balance: string;
  balanceUsd: string;
  status: "monitoring" | "paused" | "pending";
  lastEvent: string;
  eventsToday: number;
  riskScore: number;
  deployedAt: string;
}

export interface ThreatEvent {
  id: string;
  type: string;
  severity: ThreatSeverity;
  vault: string;
  vaultName: string;
  chain: string;
  description: string;
  txHash: string;
  timestamp: string;
  responseAction: string;
  responseStatus: "executed" | "pending" | "dismissed";
  amount?: string;
}

export interface ActivityItem {
  id: string;
  type: "deposit" | "withdrawal" | "pause" | "unpause" | "threat_detected" | "defense_triggered";
  description: string;
  chain: string;
  timestamp: string;
  txHash?: string;
  severity?: ThreatSeverity;
}

export interface ChainStatus {
  name: string;
  shortName: string;
  color: string;
  vaults: number;
  tvl: string;
  status: "healthy" | "degraded" | "alert";
  latency: string;
  lastBlock: string;
}

export const mockVaults: Vault[] = [
  {
    id: "vault-1",
    name: "Primary Treasury",
    address: VAULT_ADDRESS,
    chain: "Ethereum Sepolia",
    chainColor: "#627EEA",
    balance: "0.001 ETH",
    balanceUsd: "$2.50",
    status: "monitoring",
    lastEvent: "2 min ago",
    eventsToday: 3,
    riskScore: 12,
    deployedAt: "2026-02-06",
  },
  {
    id: "vault-2",
    name: "Liquidity Pool Guard",
    address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
    chain: "Arbitrum Sepolia",
    chainColor: "#28A0F0",
    balance: "0.5 ETH",
    balanceUsd: "$1,250.00",
    status: "monitoring",
    lastEvent: "15 min ago",
    eventsToday: 12,
    riskScore: 28,
    deployedAt: "2026-02-05",
  },
  {
    id: "vault-3",
    name: "Bridge Escrow",
    address: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
    chain: "Base Sepolia",
    chainColor: "#0052FF",
    balance: "1.2 ETH",
    balanceUsd: "$3,000.00",
    status: "monitoring",
    lastEvent: "1 hr ago",
    eventsToday: 5,
    riskScore: 45,
    deployedAt: "2026-02-04",
  },
];

export const mockThreats: ThreatEvent[] = [
  {
    id: "threat-1",
    type: "Anomalous Withdrawal Pattern",
    severity: "high",
    vault: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
    vaultName: "Liquidity Pool Guard",
    chain: "Arbitrum Sepolia",
    description: "3 rapid withdrawals detected within 30 seconds, totaling 0.8 ETH. Pattern matches known flash loan attack vector.",
    txHash: "0xabc123...def456",
    timestamp: "2 min ago",
    responseAction: "Emergency pause triggered via CRE workflow",
    responseStatus: "executed",
    amount: "0.8 ETH",
  },
  {
    id: "threat-2",
    type: "Unusual Large Transfer",
    severity: "medium",
    vault: VAULT_ADDRESS,
    vaultName: "Primary Treasury",
    chain: "Ethereum Sepolia",
    description: "Single transfer of 0.5 ETH detected, exceeding the 0.1 ETH threshold. Source address has no prior interaction history.",
    txHash: "0x62530372ae4dd8df5288f8947fd2639b3882874a5047a3952ca696b8d9c0be44",
    timestamp: "15 min ago",
    responseAction: "Alert sent to Slack, monitoring escalated",
    responseStatus: "executed",
    amount: "0.5 ETH",
  },
  {
    id: "threat-3",
    type: "Governance Manipulation Attempt",
    severity: "critical",
    vault: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
    vaultName: "Bridge Escrow",
    chain: "Base Sepolia",
    description: "Detected attempt to call setSentinel() from unauthorized address. Cross-chain defense activated.",
    txHash: "0x789ghi...012jkl",
    timestamp: "1 hr ago",
    responseAction: "Cross-chain pause via CCIP on all 3 chains",
    responseStatus: "executed",
  },
  {
    id: "threat-4",
    type: "Price Oracle Deviation",
    severity: "low",
    vault: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
    vaultName: "Liquidity Pool Guard",
    chain: "Arbitrum Sepolia",
    description: "ETH/USD price feed deviation of 2.3% detected between Chainlink and on-chain TWAP. Within acceptable range but flagged for monitoring.",
    txHash: "0xmno345...pqr678",
    timestamp: "3 hr ago",
    responseAction: "Logged for analysis, no action required",
    responseStatus: "dismissed",
  },
  {
    id: "threat-5",
    type: "New Address Interaction",
    severity: "info",
    vault: VAULT_ADDRESS,
    vaultName: "Primary Treasury",
    chain: "Ethereum Sepolia",
    description: "First-time depositor 0x5A48...9Db1 interacted with vault. Deposit of 0.001 ETH.",
    txHash: "0xstu901...vwx234",
    timestamp: "5 hr ago",
    responseAction: "Address added to watchlist",
    responseStatus: "executed",
    amount: "0.001 ETH",
  },
];

export const mockActivity: ActivityItem[] = [
  { id: "act-1", type: "threat_detected", description: "Anomalous withdrawal pattern on Liquidity Pool Guard", chain: "Arbitrum Sepolia", timestamp: "2 min ago", severity: "high" },
  { id: "act-2", type: "defense_triggered", description: "Emergency pause executed on Liquidity Pool Guard", chain: "Arbitrum Sepolia", timestamp: "2 min ago" },
  { id: "act-3", type: "deposit", description: "0.001 ETH deposited to Primary Treasury", chain: "Ethereum Sepolia", timestamp: "15 min ago", txHash: "0x6253...be44" },
  { id: "act-4", type: "threat_detected", description: "Unusual large transfer on Primary Treasury", chain: "Ethereum Sepolia", timestamp: "15 min ago", severity: "medium" },
  { id: "act-5", type: "threat_detected", description: "Governance manipulation attempt on Bridge Escrow", chain: "Base Sepolia", timestamp: "1 hr ago", severity: "critical" },
  { id: "act-6", type: "defense_triggered", description: "Cross-chain pause via CCIP on all chains", chain: "All Chains", timestamp: "1 hr ago" },
  { id: "act-7", type: "deposit", description: "0.5 ETH deposited to Liquidity Pool Guard", chain: "Arbitrum Sepolia", timestamp: "2 hr ago", txHash: "0xabc1...f456" },
  { id: "act-8", type: "unpause", description: "Bridge Escrow unpaused after investigation", chain: "Base Sepolia", timestamp: "4 hr ago" },
  { id: "act-9", type: "withdrawal", description: "0.02 ETH withdrawn from Primary Treasury", chain: "Ethereum Sepolia", timestamp: "6 hr ago", txHash: "0xdef7...8901" },
  { id: "act-10", type: "deposit", description: "1.2 ETH deposited to Bridge Escrow", chain: "Base Sepolia", timestamp: "12 hr ago", txHash: "0xghi2...3456" },
];

export const mockChainStatus: ChainStatus[] = [
  { name: "Ethereum Sepolia", shortName: "Sepolia", color: "#627EEA", vaults: 1, tvl: "$2.50", status: "healthy", latency: "12ms", lastBlock: "10,198,833" },
  { name: "Arbitrum Sepolia", shortName: "Arb Sepolia", color: "#28A0F0", vaults: 1, tvl: "$1,250.00", status: "alert", latency: "8ms", lastBlock: "94,521,003" },
  { name: "Base Sepolia", shortName: "Base Sepolia", color: "#0052FF", vaults: 1, tvl: "$3,000.00", status: "healthy", latency: "15ms", lastBlock: "21,445,102" },
];

export const mockStats = {
  totalTvl: "$4,252.50",
  totalVaults: 3,
  chainsMonitored: 3,
  threatsBlocked: 2,
  threatsDetected: 5,
  avgResponseTime: "1.2s",
  uptime: "99.97%",
  workflowExecutions: 847,
};
