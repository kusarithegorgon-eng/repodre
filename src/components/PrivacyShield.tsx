import { Shield, X } from "lucide-react";
import { useState, useEffect } from "react";

const DISMISS_KEY = "repodre-privacy-dismissed";

export function PrivacyShield() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-2 border-b border-teal/20 bg-teal/5 px-4 py-1.5 text-xs">
      <Shield className="h-3.5 w-3.5 shrink-0 text-teal" />
      <span className="text-muted-foreground">
        <span className="font-medium text-teal">Zero-Knowledge Analysis.</span>{" "}
        Your code and database metadata are processed locally in your browser and never stored.
      </span>
      <button
        onClick={dismiss}
        className="ml-auto shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
        title="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
