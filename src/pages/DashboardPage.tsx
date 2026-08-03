import { AuthGuard } from "@/components/AuthGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StudioPage } from "./StudioPage";

export function DashboardPage() {
  return (
    <AuthGuard>
      <ErrorBoundary>
        <StudioPage />
      </ErrorBoundary>
    </AuthGuard>
  );
}
