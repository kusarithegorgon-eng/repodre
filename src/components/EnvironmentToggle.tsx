/**
 * EnvironmentToggle — Multi-Environment Architecture Switcher
 *
 * Allows switching between Local Development and Production environment views.
 * In Production mode, the canvas overlays additional infrastructure nodes:
 * - Read-replica Database nodes adjacent to primary DB
 * - Security/Firewall Gate nodes upstream of API routes
 */

import { useState } from "react";
import { Cloud, Monitor, ChevronDown, Server, Shield } from "lucide-react";

export type Environment = "local" | "production";

export interface EnvironmentConfig {
  type: Environment;
  label: string;
  icon: typeof Monitor;
  description: string;
  features: string[];
}

export const ENVIRONMENTS: Record<Environment, EnvironmentConfig> = {
  local: {
    type: "local",
    label: "Local Development",
    icon: Monitor,
    description: "Standard development configuration without infrastructure overlays",
    features: ["Direct database access", "No rate limiting", "Hot reload enabled"],
  },
  production: {
    type: "production",
    label: "Production",
    icon: Cloud,
    description: "Production infrastructure with read replicas and security layers",
    features: ["Read-replica databases", "WAF/Firewall gates", "Rate limiting", "CDN caching"],
  },
};

interface EnvironmentToggleProps {
  value: Environment;
  onChange: (env: Environment) => void;
}

export function EnvironmentToggle({ value, onChange }: EnvironmentToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const current = ENVIRONMENTS[value];
  const Icon = current.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
          value === "production"
            ? "border-orange/50 bg-orange/10 text-orange"
            : "border-border bg-background text-muted-foreground hover:text-foreground"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{current.label}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-11 z-50 w-72 rounded-xl border border-border bg-popover p-3 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Environment Architecture
          </p>

          <div className="space-y-2">
            {(Object.entries(ENVIRONMENTS) as [Environment, EnvironmentConfig][]).map(
              ([key, config]) => {
                const ConfigIcon = config.icon;
                const isSelected = value === key;

                return (
                  <button
                    key={key}
                    onClick={() => {
                      onChange(key);
                      setIsOpen(false);
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      isSelected
                        ? "border-teal bg-teal/10"
                        : "border-border bg-background hover:border-teal/50 hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-md ${
                          isSelected ? "bg-teal/20 text-teal" : "bg-surface text-muted-foreground"
                        }`}
                      >
                        <ConfigIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                          {config.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {config.description}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-teal" />
                      )}
                    </div>

                    {key === "production" && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="inline-flex items-center gap-1 rounded bg-orange/10 px-1.5 py-0.5 text-[9px] text-orange">
                          <Server className="h-2.5 w-2.5" />
                          Read Replica
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-orange/10 px-1.5 py-0.5 text-[9px] text-orange">
                          <Shield className="h-2.5 w-2.5" />
                          WAF Layer
                        </span>
                      </div>
                    )}
                  </button>
                );
              }
            )}
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <p className="text-[10px] text-muted-foreground">
              Switching to Production mode will overlay additional infrastructure nodes on the canvas to represent read replicas and security layers.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to compute production overlay nodes.
 * Returns additional nodes to render when in production mode.
 */
export function useProductionOverlay(
  nodes: Array<{
    id: string;
    label: string;
    shape: string;
    x: number;
    y: number;
    workspace: string;
  }>,
  environment: Environment
): Array<{
  id: string;
  label: string;
  sub: string;
  shape: "cylinder" | "hexagon";
  accent: "blue" | "orange";
  x: number;
  y: number;
  workspace: string;
  isOverlay?: boolean;
}> {
  if (environment !== "production") return [];

  const overlayNodes: Array<{
    id: string;
    label: string;
    sub: string;
    shape: "cylinder" | "hexagon";
    accent: "blue" | "orange";
    x: number;
    y: number;
    workspace: string;
    isOverlay?: boolean;
  }> = [];

  // Find primary database nodes and add read replicas
  const dbNodes = nodes.filter(
    (n) => n.shape === "cylinder"
  );

  dbNodes.forEach((dbNode, idx) => {
    // Place read replica to the right of the primary database
    overlayNodes.push({
      id: `read-replica-${dbNode.id}`,
      label: `${dbNode.label}-replica`,
      sub: "Read Replica",
      shape: "cylinder",
      accent: "blue",
      x: dbNode.x + 240,
      y: dbNode.y - 60,
      workspace: dbNode.workspace,
      isOverlay: true,
    });
  });

  // Find API route nodes (controllers) and add firewall gates upstream
  const controllerNodes = nodes.filter(
    (n) => n.shape === "rectangle"
  );

  controllerNodes.forEach((ctrlNode, idx) => {
    // Only add firewall gate for the first controller in each group
    if (idx === 0) {
      overlayNodes.push({
        id: `firewall-${ctrlNode.id}`,
        label: "WAF",
        sub: "Security/Firewall",
        shape: "hexagon",
        accent: "orange",
        x: ctrlNode.x - 180,
        y: ctrlNode.y - 80,
        workspace: ctrlNode.workspace,
        isOverlay: true,
      });
    }
  });

  return overlayNodes;
}
