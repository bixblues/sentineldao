"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useBalance, useAccount } from "wagmi";
import { formatEther } from "viem";
import { Bell, Wallet, ChevronDown } from "lucide-react";
import { useOverview } from "@/lib/hooks";
import Link from "next/link";

// Wallet section is split out so it only renders after WagmiProvider is mounted
function WalletSection() {
  const { address, isConnected } = useAccount();
  const { data: balanceData } = useBalance({
    address,
    query: { enabled: isConnected },
  });

  const formattedBalance = balanceData
    ? `${Number(formatEther(balanceData.value)).toFixed(4)} ${balanceData.symbol}`
    : null;

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
            className="flex items-center gap-2"
          >
            {(() => {
              if (!connected) {
                return (
                  <Button
                    size="sm"
                    className="gap-2 h-9"
                    onClick={openConnectModal}
                  >
                    <Wallet className="h-4 w-4" />
                    Connect Wallet
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-9"
                    onClick={openChainModal}
                  >
                    Wrong Network
                  </Button>
                );
              }

              return (
                <>
                  {/* Chain selector */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-9 px-2.5 border-border"
                    onClick={openChainModal}
                  >
                    {chain.hasIcon && chain.iconUrl && (
                      <img
                        alt={chain.name ?? "Chain"}
                        src={chain.iconUrl}
                        className="h-4 w-4 rounded-full"
                      />
                    )}
                    <span className="text-xs hidden sm:inline">
                      {chain.name}
                    </span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>

                  {/* Account button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9 px-3 border-border"
                    onClick={openAccountModal}
                  >
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="font-mono text-xs">
                      {account.displayName}
                    </span>
                    {formattedBalance && (
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {formattedBalance}
                      </span>
                    )}
                  </Button>
                </>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

export function Header() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data: overview } = useOverview();
  const pendingCount = overview?.pendingThreats ?? 0;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl px-6">
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className="border-primary/40 text-primary text-xs font-medium px-2.5 py-0.5"
        >
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Sepolia Testnet
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <Link href="/threats">
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <Bell className="h-4 w-4" />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </Button>
        </Link>

        {/* Wallet — only rendered client-side after WagmiProvider is mounted */}
        {mounted && <WalletSection />}
      </div>
    </header>
  );
}
