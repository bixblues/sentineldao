"use client";

import { useState, useEffect, useRef } from "react";
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider, type Config } from "wagmi";
import { sepolia, arbitrumSepolia, baseSepolia } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";

// Lazy-init: avoid calling getDefaultConfig at module scope
// because WalletConnect accesses indexedDB which doesn't exist during SSR.
let _config: Config | null = null;
function getConfig(): Config {
  if (!_config) {
    _config = getDefaultConfig({
      appName: "SentinelDAO",
      projectId: "sentineldao-dev", // WalletConnect project ID — replace for production
      chains: [sepolia, arbitrumSepolia, baseSepolia],
      ssr: true,
    });
  }
  return _config;
}

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const configRef = useRef<Config | null>(null);

  useEffect(() => {
    configRef.current = getConfig();
    setMounted(true);
  }, []);

  if (!mounted || !configRef.current) {
    // Return children without wallet providers during SSR to avoid indexedDB errors
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={configRef.current}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#6366f1",
            accentColorForeground: "white",
            borderRadius: "medium",
            fontStack: "system",
          })}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
