import { Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { onAuthStateChange, type GitHubAuthState } from "@/lib/github-auth";

export function RootPage() {
  const [mounted, setMounted] = useState(false);

  // Set up global auth listener
  useEffect(() => {
    setMounted(true);

    // Store auth listener cleanup on window for components to access
    const cleanup = onAuthStateChange((state) => {
      (window as unknown as { authState?: GitHubAuthState }).authState = state;
      // Dispatch custom event for components to react
      window.dispatchEvent(
        new CustomEvent("auth-state-change", { detail: state })
      );
    });

    (window as unknown as { authListener?: () => void }).authListener = cleanup;

    return () => {
      cleanup();
    };
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    );
  }

  return <Outlet />;
}
