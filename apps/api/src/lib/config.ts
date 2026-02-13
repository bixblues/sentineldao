export const config = {
  port: Number(process.env.API_PORT || 3001),
  rpc: {
    sepolia:
      process.env.CRE_ETHEREUM_SEPOLIA_RPC ||
      "https://ethereum-sepolia-rpc.publicnode.com",
    arbitrumSepolia:
      process.env.ARBITRUM_SEPOLIA_RPC ||
      "https://sepolia-rollup.arbitrum.io/rpc",
    baseSepolia: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
  },
  privateKey: process.env.CRE_ETH_PRIVATE_KEY as `0x${string}` | undefined,
  vaultAddress: (process.env.VAULT_ADDRESS ||
    "0x28281051a57d2769641b043A0f150a2A9D7e96e2") as `0x${string}`,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  ccip: {
    senderAddress: (process.env.CCIP_SENDER_ADDRESS || "") as `0x${string}`,
    receivers: {
      "arbitrum-sepolia": (process.env.CCIP_RECEIVER_ARB_SEPOLIA ||
        "") as `0x${string}`,
      "base-sepolia": (process.env.CCIP_RECEIVER_BASE_SEPOLIA ||
        "") as `0x${string}`,
    },
    chainSelectors: {
      "ethereum-sepolia": BigInt(
        process.env.CCIP_SELECTOR_SEPOLIA || "16015286601757825753",
      ),
      "arbitrum-sepolia": BigInt(
        process.env.CCIP_SELECTOR_ARB_SEPOLIA || "3478487238524512106",
      ),
      "base-sepolia": BigInt(
        process.env.CCIP_SELECTOR_BASE_SEPOLIA || "10344971235874465080",
      ),
    },
  },
};

export const CHAIN_CONFIG = {
  "ethereum-sepolia": {
    chainId: 11155111,
    name: "Ethereum Sepolia",
    shortName: "Sepolia",
    color: "#627EEA",
    explorer: "https://sepolia.etherscan.io",
  },
  "arbitrum-sepolia": {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    shortName: "Arb Sepolia",
    color: "#28A0F0",
    explorer: "https://sepolia.arbiscan.io",
  },
  "base-sepolia": {
    chainId: 84532,
    name: "Base Sepolia",
    shortName: "Base Sepolia",
    color: "#0052FF",
    explorer: "https://sepolia.basescan.org",
  },
} as const;

export type ChainKey = keyof typeof CHAIN_CONFIG;
