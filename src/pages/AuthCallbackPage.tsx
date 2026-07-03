import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader as Loader2, CircleCheck as CheckCircle, Circle as XCircle } from "lucide-react";
import { handleAuthCallback } from "@/lib/github-auth";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function processCallback() {
      try {
        // Handle the OAuth callback from GitHub
        await handleAuthCallback();
        setStatus("success");

        // Redirect immediately — no artificial delay
        navigate({ to: "/studio" });
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    }

    processCallback();
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <div className="text-center">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-teal" />
            <p className="mt-4 text-lg text-muted-foreground">Completing sign in...</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="mx-auto h-12 w-12 text-teal" />
            <p className="mt-4 text-lg text-foreground">Successfully signed in!</p>
            <p className="mt-2 text-sm text-muted-foreground">Redirecting...</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <p className="mt-4 text-lg text-foreground">Sign in failed</p>
            <p className="mt-2 text-sm text-red-500">{error}</p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-4 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-teal hover:text-foreground"
            >
              Go back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
