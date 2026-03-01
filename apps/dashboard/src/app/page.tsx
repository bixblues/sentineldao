import { AppShell } from "@/components/layout/app-shell";
import { OverviewPage } from "@/components/pages/overview";
import { AuthGuard } from "@/components/auth-guard";

export default function Home() {
  return (
    <AuthGuard>
      <AppShell>
        <OverviewPage />
      </AppShell>
    </AuthGuard>
  );
}
