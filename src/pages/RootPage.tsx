import { Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { onAuthStateChange, type GitHubAuthState } from "@/lib/github-auth";
import { supabase } from "@/lib/supabase";

const CANVAS_STORAGE_KEY = "repodre-canvas-v1";

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

    // Also listen directly to supabase auth events to clear active-project state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        try {
          localStorage.removeItem(CANVAS_STORAGE_KEY);
          sessionStorage.removeItem("repodre-draft-graph");
        } catch {}
      }
    });

    const combinedCleanup = () => {
      cleanup();
      subscription.unsubscribe();
    };

    (window as unknown as { authListener?: () => void }).authListener = combinedCleanup;

    return () => {
      combinedCleanup();
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
