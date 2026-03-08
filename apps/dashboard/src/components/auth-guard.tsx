"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  // Check onboarding status after auth is confirmed
  useEffect(() => {
    async function checkOnboarding() {
      if (!user) return;

      // Skip onboarding check if already on onboarding page
      if (pathname === "/onboarding") {
        setCheckingOnboarding(false);
        setOnboardingComplete(true);
        return;
      }

      try {
        const status = await api.getOnboardingStatus();
        setOnboardingComplete(status.onboardingCompleted);

        if (!status.onboardingCompleted) {
          router.replace("/onboarding");
        }
      } catch (error) {
        // If API fails, assume onboarding is complete to avoid blocking
        console.error("Failed to check onboarding status:", error);
        setOnboardingComplete(true);
      } finally {
        setCheckingOnboarding(false);
      }
    }

    if (user && !isLoading) {
      checkOnboarding();
    }
  }, [user, isLoading, router, pathname]);

  // Show loading or redirect - don't render children until authenticated
  if (isLoading || checkingOnboarding) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show nothing while redirecting
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-400">Redirecting...</p>
        </div>
      </div>
    );
  }

  // If onboarding not complete, show nothing while redirecting
  if (!onboardingComplete) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-400">Setting up...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
