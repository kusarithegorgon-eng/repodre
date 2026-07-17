import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

export function HomeButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(session?.user));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isAuthenticated) navigate({ to: "/dashboard" });
    else navigate({ to: "/" });
  };

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
