import { AuthGuard } from "@/components/AuthGuard";
import { StudioPage } from "./StudioPage";

export function DashboardPage() {
  return (
    <AuthGuard>
      <StudioPage />
    </AuthGuard>
  );
}
