"use client";

import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { SimulatorPanel } from "@/components/simulator-panel";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="pl-[240px] transition-all duration-300">
        <Header />
        <main className="p-6">{children}</main>
      </div>
      <SimulatorPanel />
    </div>
  );
}
