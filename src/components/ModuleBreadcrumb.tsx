/**
 * Module Breadcrumb — Navigation Trail for Active Transitions
 *
 * Displays the current module path when a spatial connector is active:
 *   App > Auth > Dashboard
 *
 * Features:
 *   - Click-to-navigate to any ancestor module
 *   - Visual indicator for active transition
 *   - Animated reveal on transition activation
 */

import { useMemo, memo } from "react";
import { ChevronRight, Circle } from "lucide-react";

export interface BreadcrumbItem {
  name: string;
  isActive: boolean;
  transitionId?: string;
}

export interface ModuleBreadcrumbProps {
  /** Ordered list of module names in the path */
  modules: string[];
  /** Currently active transition ID */
  activeTransitionId?: string;
  /** Callback when a module segment is clicked */
  onModuleClick?: (moduleName: string, index: number) => void;
  /** Whether to show the breadcrumb */
  visible: boolean;
}

export function ModuleBreadcrumb({
  modules,
  activeTransitionId,
  onModuleClick,
  visible,
}: ModuleBreadcrumbProps) {
  const items = useMemo<BreadcrumbItem[]>(() => {
    return modules.map((name, index) => ({
      name,
      isActive: index === modules.length - 1,
      transitionId: index > 0 ? `trans_${index}` : undefined,
    }));
  }, [modules]);

  if (!visible || modules.length === 0) return null;

  return (
    <div
      className="module-breadcrumb fixed top-4 left-1/2 -translate-x-1/2 z-50
        flex items-center gap-1 px-4 py-2 rounded-xl
        bg-surface/95 border border-border shadow-lg backdrop-blur-sm
        animate-in fade-in slide-in-from-top-2 duration-200"
      role="navigation"
      aria-label="Module path"
    >
      {items.map((item, index) => (
        <BreadcrumbSegment
          key={`${item.name}-${index}`}
          item={item}
          index={index}
          isLast={index === items.length - 1}
          onClick={onModuleClick}
        />
      ))}

      {activeTransitionId && (
        <div
          className="ml-3 flex items-center gap-1.5 px-2 py-1 rounded-lg
            bg-teal/10 border border-teal/30"
          title="Active transition"
        >
          <Circle className="h-3 w-3 fill-teal text-teal" />
          <span className="text-xs font-medium text-teal">Active Path</span>
        </div>
      )}
    </div>
  );
}

interface BreadcrumbSegmentProps {
  item: BreadcrumbItem;
  index: number;
  isLast: boolean;
  onClick?: (moduleName: string, index: number) => void;
}

const BreadcrumbSegment = memo(function BreadcrumbSegment({
  item,
  index,
  isLast,
  onClick,
}: BreadcrumbSegmentProps) {
  const isClickable = !isLast && index > 0 && onClick !== undefined;

  const handleClick = () => {
    if (isClickable && onClick) {
      onClick(item.name, index);
    }
  };

  return (
    <>
      {index > 0 && (
        <ChevronRight
          className="h-4 w-4 text-muted-foreground/50"
          aria-hidden="true"
        />
      )}

      <button
        type="button"
        onClick={handleClick}
        disabled={!isClickable}
        className={`
          flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium text-sm
          transition-colors duration-150
          ${
            item.isActive
              ? "bg-teal/15 text-teal cursor-default"
              : isClickable
                ? "text-foreground hover:bg-surface-hover hover:text-teal cursor-pointer"
                : "text-muted-foreground cursor-default"
          }
        `}
        aria-current={item.isActive ? "location" : undefined}
      >
        {item.name}
      </button>
    </>
  );
});

export default ModuleBreadcrumb;
