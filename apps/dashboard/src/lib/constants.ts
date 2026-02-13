export const VAULT_ADDRESS = "0x28281051a57d2769641b043A0f150a2A9D7e96e2";
export const DEPLOYER_ADDRESS = "0x5A483beec6C27eA7e75B0B8A5cad6FCBD9d79Db1";
export const SENTINEL_FORWARDER = "0x15fc6ae953e024d975e77382eeec56a9101f9f88";

export const CHAINS = {
  sepolia: {
    id: 11155111,
    name: "Ethereum Sepolia",
    shortName: "Sepolia",
    icon: "ethereum",
    explorer: "https://sepolia.etherscan.io",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    color: "#627EEA",
  },
  arbitrumSepolia: {
    id: 421614,
    name: "Arbitrum Sepolia",
    shortName: "Arb Sepolia",
    icon: "arbitrum",
    explorer: "https://sepolia.arbiscan.io",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    color: "#28A0F0",
  },
  baseSepolia: {
    id: 84532,
    name: "Base Sepolia",
    shortName: "Base Sepolia",
    icon: "base",
    explorer: "https://sepolia.basescan.org",
    rpc: "https://sepolia.base.org",
    color: "#0052FF",
  },
} as const;

export type ChainKey = keyof typeof CHAINS;

export const THREAT_SEVERITY = {
  critical: { label: "Critical", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
  high: { label: "High", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  medium: { label: "Medium", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  low: { label: "Low", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  info: { label: "Info", color: "text-muted-foreground", bg: "bg-muted/50", border: "border-border" },
} as const;

export type ThreatSeverity = keyof typeof THREAT_SEVERITY;
