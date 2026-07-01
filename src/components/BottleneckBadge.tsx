/**
 * BottleneckBadge — Architectural Latency Warning Flag
 *
 * Displays a warning indicator on edges that have synchronous
 * bottlenecks detected by the bottleneck analyzer.
 */

import { useState } from "react";
import { TriangleAlert as AlertTriangle, X, Zap, Clock, Database, Mail, CreditCard } from "lucide-react";
import type { BottleneckWarning } from "@/lib/bottleneck-analyzer";

interface BottleneckBadgeProps {
  warnings: BottleneckWarning[];
  compact?: boolean;
}

const SEVERITY_COLORS = {
  high: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-500",
    icon: "text-red-500",
  },
  medium: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-500",
    icon: "text-amber-500",
  },
  low: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-500",
    icon: "text-blue-500",
  },
};

const TYPE_ICONS = {
  sync_db_chain: Database,
  sync_payment: CreditCard,
  sync_email: Mail,
  sync_heavy_loop: Clock,
};

function getSeverityColor(severity: "high" | "medium" | "low") {
  return SEVERITY_COLORS[severity];
}

export function BottleneckBadge({ warnings, compact }: BottleneckBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (warnings.length === 0) return null;

  const highestSeverity = warnings.reduce<"high" | "medium" | "low">(
    (acc, w) => (w.severity === "high" ? "high" : w.severity === "medium" && acc !== "high" ? "medium" : acc),
    "low"
  );

  const colors = getSeverityColor(highestSeverity);

  if (compact) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className={`flex h-5 w-5 items-center justify-center rounded-full ${colors.bg} ${colors.border} border transition-transform hover:scale-110`}
        title="Architectural latency warning"
      >
        <AlertTriangle className={`h-3 w-3 ${colors.icon}`} />
      </button>
    );
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${colors.bg} ${colors.border} border transition-all hover:scale-105`}
      >
        <AlertTriangle className={`h-3.5 w-3.5 ${colors.icon}`} />
        <span className={`text-xs font-medium ${colors.text}`}>
          {warnings.length === 1 ? "1 Warning" : `${warnings.length} Warnings`}
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setIsOpen(false)}>
          <div
            className="absolute right-4 top-20 w-96 rounded-xl border border-border bg-popover p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.bg}`}>
                  <Zap className={`h-4 w-4 ${colors.icon}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Scale Optimization</h3>
                  <p className="text-xs text-muted-foreground">Architectural latency warnings</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-2">
              {warnings.map((warning, idx) => (
                <WarningCard key={idx} warning={warning} />
              ))}
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                High-overhead synchronous execution detected. Consider offloading mutations to a background worker queue to lower Time-To-First-Byte (TTFB).
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WarningCard({ warning }: { warning: BottleneckWarning }) {
  const colors = getSeverityColor(warning.severity);
  const Icon = TYPE_ICONS[warning.type] || AlertTriangle;

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} p-2.5`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${colors.icon}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">{warning.description}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{warning.recommendation}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {warning.detectedPatterns.map((pattern, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {pattern}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BottleneckEdgeIndicator({
  warnings,
  onClick,
}: {
  warnings: BottleneckWarning[];
  onClick?: () => void;
}) {
  if (warnings.length === 0) return null;

  const highestSeverity = warnings.reduce<"high" | "medium" | "low">(
    (acc, w) => (w.severity === "high" ? "high" : w.severity === "medium" && acc !== "high" ? "medium" : acc),
    "low"
  );

  const colors = SEVERITY_COLORS[highestSeverity];

  return (
    <g
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <circle
        r="8"
        fill={highestSeverity === "high" ? "#dc2626" : highestSeverity === "medium" ? "#d97706" : "#3b82f6"}
        stroke="white"
        strokeWidth="2"
        className="animate-pulse"
      />
      <AlertTriangle
        x="-4"
        y="-4"
        width="8"
        height="8"
        fill="white"
        stroke="white"
        strokeWidth="0.5"
      />
    </g>
  );
}

export function BottleneckSummary({ warnings }: { warnings: BottleneckWarning[] }) {
  if (warnings.length === 0) return null;

  const highCount = warnings.filter((w) => w.severity === "high").length;
  const mediumCount = warnings.filter((w) => w.severity === "medium").length;
  const lowCount = warnings.filter((w) => w.severity === "low").length;

  return (
    <div className="flex items-center gap-2">
      {highCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
          <AlertTriangle className="h-3 w-3" />
          {highCount} High
        </span>
      )}
      {mediumCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
          <AlertTriangle className="h-3 w-3" />
          {mediumCount} Medium
        </span>
      )}
      {lowCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
          <AlertTriangle className="h-3 w-3" />
          {lowCount} Low
        </span>
      )}
    </div>
  );
}
