/**
 * SystemInsightsDashboard — Architectural Health & Orphan Analytics
 *
 * A dashboard panel that scans the active canvas context arrays to calculate
 * and display structural system metrics: Total Views, Total Controllers,
 * Database Associations. Flags orphaned entities and unvalidated entry points.
 */

import { useState, useMemo, useCallback } from "react";
import { Activity, TriangleAlert as AlertTriangle, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, Database, Eye, GitBranch, Shield, ShieldAlert, X, ChevronDown, ChevronRight } from "lucide-react";

interface InsightNode {
  id: string;
  label: string;
  type: "view" | "validation" | "controller" | "database" | "error";
}

interface InsightEdge {
  id: string;
  from: string;
  to: string;
}

export interface SystemMetrics {
  totalViews: number;
  totalControllers: number;
  totalValidations: number;
  totalDatabases: number;
  totalEdges: number;
  orphanedNodes: OrphanedEntity[];
  unvalidatedControllers: UnvalidatedEntry[];
}

export interface OrphanedEntity {
  id: string;
  label: string;
  type: string;
  edgeCount: number;
}

export interface UnvalidatedEntry {
  id: string;
  label: string;
  path: string[];
}

interface SystemInsightsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: InsightNode[];
  edges: InsightEdge[];
}

export function SystemInsightsDashboard({
  isOpen,
  onClose,
  nodes,
  edges,
}: SystemInsightsDashboardProps) {
  const [expandedOrphans, setExpandedOrphans] = useState(true);
  const [expandedUnvalidated, setExpandedUnvalidated] = useState(true);

  const metrics = useMemo(() => {
    const viewNodes = nodes.filter((n) => n.type === "view");
    const controllerNodes = nodes.filter((n) => n.type === "controller");
    const validationNodes = nodes.filter((n) => n.type === "validation");
    const databaseNodes = nodes.filter((n) => n.type === "database");

    // Count edges per node
    const edgeCountByNode = new Map<string, number>();
    for (const node of nodes) {
      const count = edges.filter((e) => e.from === node.id || e.to === node.id).length;
      edgeCountByNode.set(node.id, count);
    }

    // Find orphaned nodes (edge count = 0)
    const orphanedNodes: OrphanedEntity[] = nodes
      .filter((n) => edgeCountByNode.get(n.id) === 0)
      .map((n) => ({
        id: n.id,
        label: n.label,
        type: n.type,
        edgeCount: 0,
      }));

    // Find controllers that bypass validation
    // A controller is "unvalidated" if there's a path from a view to it
    // that doesn't pass through a validation node
    const unvalidatedControllers: UnvalidatedEntry[] = [];

    for (const controller of controllerNodes) {
      const incomingEdges = edges.filter((e) => e.to === controller.id);
      for (const edge of incomingEdges) {
        const sourceNode = nodes.find((n) => n.id === edge.from);
        if (sourceNode?.type === "view") {
          // Direct view-to-controller connection without validation
          unvalidatedControllers.push({
            id: controller.id,
            label: controller.label,
            path: [sourceNode.label, controller.label],
          });
        } else if (sourceNode?.type !== "validation") {
          // Check if there's a path from a view that skips validation
          const visited = new Set<string>();
          const tracePath = (nodeId: string, path: string[]): boolean => {
            if (visited.has(nodeId)) return false;
            visited.add(nodeId);

            const n = nodes.find((nn) => nn.id === nodeId);
            if (!n) return false;

            if (n.type === "view") {
              unvalidatedControllers.push({
                id: controller.id,
                label: controller.label,
                path: [...path, n.label].reverse(),
              });
              return true;
            }

            // Continue tracing upstream
            const upstream = edges.filter((e) => e.to === nodeId);
            for (const ue of upstream) {
              if (tracePath(ue.from, [...path, n.label])) {
                return true;
              }
            }
            return false;
          };

          // Trace back from sourceNode
          const srcEdges = edges.filter((e) => e.to === sourceNode.id);
          for (const se of srcEdges) {
            const prevNode = nodes.find((n) => n.id === se.from);
            if (prevNode?.type === "view") {
              unvalidatedControllers.push({
                id: controller.id,
                label: controller.label,
                path: [prevNode.label, sourceNode.label, controller.label],
              });
            }
          }
        }
      }
    }

    // Dedupe unvalidated controllers
    const seenUnvalidated = new Set<string>();
    const uniqueUnvalidated = unvalidatedControllers.filter((u) => {
      if (seenUnvalidated.has(u.id)) return false;
      seenUnvalidated.add(u.id);
      return true;
    });

    return {
      totalViews: viewNodes.length,
      totalControllers: controllerNodes.length,
      totalValidations: validationNodes.length,
      totalDatabases: databaseNodes.length,
      totalEdges: edges.length,
      orphanedNodes,
      unvalidatedControllers: uniqueUnvalidated,
    };
  }, [nodes, edges]);

  const healthScore = useMemo(() => {
    if (nodes.length === 0) return 100;
    const issues = metrics.orphanedNodes.length + metrics.unvalidatedControllers.length;
    const maxIssues = nodes.length;
    return Math.max(0, Math.round(100 - (issues / maxIssues) * 50));
  }, [metrics, nodes.length]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-y-0 left-0 z-50 flex w-80 flex-col bg-popover border-r border-border shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-teal" />
          <span className="text-sm font-semibold text-foreground">System Insights</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Health Score */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Architecture Health</span>
          <span className={`text-lg font-bold ${
            healthScore >= 80 ? "text-green-500" :
            healthScore >= 50 ? "text-yellow-500" :
            "text-red-500"
          }`}>
            {healthScore}%
          </span>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              healthScore >= 80 ? "bg-green-500" :
              healthScore >= 50 ? "bg-yellow-500" :
              "bg-red-500"
            }`}
            style={{ width: `${healthScore}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 p-4 border-b border-border">
        <MetricCard
          icon={<Eye className="h-4 w-4" />}
          label="Views"
          value={metrics.totalViews}
          color="text-emerald-500"
        />
        <MetricCard
          icon={<GitBranch className="h-4 w-4" />}
          label="Controllers"
          value={metrics.totalControllers}
          color="text-sky-500"
        />
        <MetricCard
          icon={<Shield className="h-4 w-4" />}
          label="Validations"
          value={metrics.totalValidations}
          color="text-amber-500"
        />
        <MetricCard
          icon={<Database className="h-4 w-4" />}
          label="Databases"
          value={metrics.totalDatabases}
          color="text-blue-500"
        />
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-auto">
        {/* Orphaned Entities */}
        <div className="border-b border-border">
          <button
            onClick={() => setExpandedOrphans(!expandedOrphans)}
            className="flex w-full items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {metrics.orphanedNodes.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              <span className="text-sm font-medium text-foreground">Orphaned Entities</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${
                metrics.orphanedNodes.length > 0 ? "text-yellow-500" : "text-green-500"
              }`}>
                {metrics.orphanedNodes.length}
              </span>
              {expandedOrphans ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>
          {expandedOrphans && (
            <div className="px-4 pb-3">
              {metrics.orphanedNodes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  All nodes are connected to the graph.
                </p>
              ) : (
                <div className="space-y-2">
                  {metrics.orphanedNodes.map((node) => (
                    <div
                      key={node.id}
                      className="flex items-center gap-2 text-xs rounded-lg border border-border p-2"
                    >
                      <AlertCircle className="h-3 w-3 text-yellow-500" />
                      <span className="font-mono text-muted-foreground">{node.label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground/60">
                        {node.type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Unvalidated Entry Points */}
        <div>
          <button
            onClick={() => setExpandedUnvalidated(!expandedUnvalidated)}
            className="flex w-full items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {metrics.unvalidatedControllers.length > 0 ? (
                <ShieldAlert className="h-4 w-4 text-red-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              <span className="text-sm font-medium text-foreground">Unvalidated Entry Points</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${
                metrics.unvalidatedControllers.length > 0 ? "text-red-500" : "text-green-500"
              }`}>
                {metrics.unvalidatedControllers.length}
              </span>
              {expandedUnvalidated ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>
          {expandedUnvalidated && (
            <div className="px-4 pb-3">
              {metrics.unvalidatedControllers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  All controllers are protected by validation.
                </p>
              ) : (
                <div className="space-y-2">
                  {metrics.unvalidatedControllers.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-1 text-xs rounded-lg border border-red-500/30 bg-red-500/5 p-2"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-3 w-3 text-red-500" />
                        <span className="font-mono font-medium text-foreground">
                          {entry.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        {entry.path.map((p, i) => (
                          <span key={i}>
                            {i > 0 && <span className="text-red-500/50">→</span>}
                            <span>{p}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary Footer */}
      <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Total Connections</span>
          <span className="font-mono">{metrics.totalEdges}</span>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface/50 p-3">
      <div className={color}>{icon}</div>
      <span className="mt-1 text-lg font-bold text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

export function SystemInsightsToggle({
  onClick,
  isOpen,
  warningCount,
}: {
  onClick: () => void;
  isOpen: boolean;
  warningCount: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isOpen
          ? "border-teal bg-teal/10 text-teal"
          : warningCount > 0
          ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-600"
          : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
      }`}
    >
      <Activity className="h-3.5 w-3.5" />
      Insights
      {warningCount > 0 && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-[10px] font-bold text-white">
          {warningCount}
        </span>
      )}
    </button>
  );
}
