/**
 * Spatial Connector Node — Module Transition Visual
 *
 * Renders as a small circle node representing a transition between modules.
 * Features:
 *   - Clickable for path highlighting
 *   - Exit/Entry indicators
 *   - Sync point visualization
 *   - Connected pair highlighting
 */

import { memo, useCallback } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import type { SpatialConnector, TransitionPoint } from "@/lib/modular-link-layer";

export interface SpatialConnectorNodeProps {
  connector: SpatialConnector;
  transition?: TransitionPoint;
  isActive: boolean;
  highlighted: boolean;
  onClick?: (connectorId: string, transitionId: string) => void;
  onMouseEnter?: (connectorId: string) => void;
  onMouseLeave?: () => void;
}

const CONNECTOR_SIZE = 56;
const RADIUS = 24;

export function SpatialConnectorNode({
  connector,
  transition,
  isActive,
  highlighted,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: SpatialConnectorNodeProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onClick) {
        onClick(connector.id, connector.transitionId);
      }
    },
    [connector, onClick]
  );

  const handleMouseEnter = useCallback(() => {
    if (onMouseEnter) {
      onMouseEnter(connector.id);
    }
  }, [connector.id, onMouseEnter]);

  const ArrowIcon = connector.isExit ? ArrowRight : ArrowLeft;
  const arrowLabel = connector.isExit ? "Exit" : "Enter";

  return (
    <g
      transform={`translate(${connector.x}, ${connector.y})`}
      className="spatial-connector-node"
      style={{ cursor: "pointer" }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Outer glow for active state */}
      {isActive && (
        <circle
          r={RADIUS + 8}
          fill="none"
          stroke="var(--teal)"
          strokeWidth={2}
          strokeDasharray="4 4"
          opacity={0.6}
          className="animate-spin-slow"
        />
      )}

      {/* Main connector circle */}
      <circle
        r={RADIUS}
        fill={highlighted ? "var(--teal)" : "var(--slate)"}
        stroke={isActive ? "var(--teal)" : "var(--slate)"}
        strokeWidth={isActive ? 3 : 2}
        opacity={highlighted ? 1 : 0.4}
        className="transition-all duration-200"
      />

      {/* Inner pattern (sync point indicator) */}
      <circle
        r={RADIUS - 6}
        fill="none"
        stroke={highlighted ? "var(--surface)" : "var(--border)"}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        opacity={0.7}
      />

      {/* Arrow icon indicating exit/entry */}
      <foreignObject x={-12} y={-12} width={24} height={24}>
        <div className="flex items-center justify-center w-full h-full">
          <ArrowIcon
            className={`h-4 w-4 ${
              highlighted ? "text-surface" : "text-muted-foreground"
            }`}
          />
        </div>
      </foreignObject>

      {/* Label above the connector */}
      <text
        y={-RADIUS - 8}
        textAnchor="middle"
        fontSize={11}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight={600}
        fill={highlighted ? "var(--teal)" : "var(--muted-foreground)"}
      >
        {transition?.fromContext.name ?? "Module"}
      </text>

      {/* Exit/Entry label */}
      <text
        y={RADIUS + 18}
        textAnchor="middle"
        fontSize={9}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight={500}
        fill="var(--muted-foreground)"
        opacity={highlighted ? 1 : 0.6}
      >
        {arrowLabel} Point
      </text>

      {/* Pair indicator line (to connected connector) */}
      {connector.pairedConnectorId && (
        <line
          x1={0}
          y1={RADIUS + 4}
          x2={0}
          y2={RADIUS + 12}
          stroke="var(--teal)"
          strokeWidth={1.5}
          strokeDasharray="2 2"
          opacity={isActive ? 0.8 : 0.3}
        />
      )}
    </g>
  );
}

export default memo(SpatialConnectorNode);

/**
 * Render a pair of connected spatial connectors.
 */
export interface SpatialConnectorPairProps {
  pair: {
    exitConnector: SpatialConnector;
    entryConnector: SpatialConnector;
    transition: TransitionPoint;
  };
  highlightedConnectors: Set<string>;
  activeTransitionId: string | null;
  onConnectorClick?: (connectorId: string, transitionId: string) => void;
}

export function SpatialConnectorPair({
  pair,
  highlightedConnectors,
  activeTransitionId,
  onConnectorClick,
}: SpatialConnectorPairProps) {
  // Render connecting line between paired connectors
  const isConnected = activeTransitionId === pair.transition.transitionId;

  return (
    <g className="spatial-connector-pair">
      {/* Connection line when active */}
      {isConnected && (
        <line
          x1={pair.exitConnector.x}
          y1={pair.exitConnector.y}
          x2={pair.entryConnector.x}
          y2={pair.entryConnector.y}
          stroke="var(--teal)"
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.6}
          className="animate-dash"
        />
      )}

      <SpatialConnectorNode
        connector={pair.exitConnector}
        transition={pair.transition}
        isActive={isConnected}
        highlighted={highlightedConnectors.has(pair.exitConnector.id)}
        onClick={onConnectorClick}
      />

      <SpatialConnectorNode
        connector={pair.entryConnector}
        transition={pair.transition}
        isActive={isConnected}
        highlighted={highlightedConnectors.has(pair.entryConnector.id)}
        onClick={onConnectorClick}
      />
    </g>
  );
}
