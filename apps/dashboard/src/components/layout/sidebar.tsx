"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Shield,
  AlertTriangle,
  Settings,
  BarChart3,
  Vault,
  Activity,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useMemo } from "react";
import { useThreats } from "@/lib/hooks";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/vaults", label: "Vaults", icon: Vault },
  { href: "/threats", label: "Threats", icon: AlertTriangle },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { data: threats } = useThreats();
  const pendingThreatCount = useMemo(
    () => threats?.filter((t) => t.responseStatus === "pending").length ?? 0,
    [threats],
  );

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r border-border bg-card/80 backdrop-blur-xl transition-all duration-300 flex flex-col",
          collapsed ? "w-[68px]" : "w-[240px]",
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-border px-4">
          <Link href="/" className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-bold text-foreground leading-tight">
                  SentinelDAO
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  Protocol Defense
                </span>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;

            const linkContent = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4.5 w-4.5 shrink-0",
                    isActive && "text-primary",
                  )}
                />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed &&
                  item.href === "/threats" &&
                  pendingThreatCount > 0 && (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                      {pendingThreatCount > 9 ? "9+" : pendingThreatCount}
                    </span>
                  )}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border p-3 space-y-2">
          {!collapsed && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">
                  System Status
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs text-muted-foreground">
                  All workflows active
                </span>
              </div>
            </div>
          )}

          {!collapsed && (
            <a
              href="https://sepolia.etherscan.io"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Etherscan</span>
            </a>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
