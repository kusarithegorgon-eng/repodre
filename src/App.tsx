import { useMemo, useState } from "react";
import {
  SAMPLE_SCHEMA,
  type ErdRelationship,
  type ErdTable,
} from "./erd/data";
import { TableCard } from "./erd/TableCard";
import { RelationshipLine } from "./erd/RelationshipLine";
import { GuidePanel } from "./erd/GuidePanel";
import { RelationshipPanel } from "./erd/RelationshipPanel";

const CANVAS_W = 1040;
const CANVAS_H = 720;

export default function App() {
  const [hoveredRel, setHoveredRel] = useState<string | null>(null);
  const [selectedRel, setSelectedRel] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  const tableMap = useMemo(() => {
    const m = new Map<string, ErdTable>();
    SAMPLE_SCHEMA.tables.forEach((t) => m.set(t.id, t));
    return m;
  }, []);

  const relMap = useMemo(() => {
    const m = new Map<string, ErdRelationship>();
    SAMPLE_SCHEMA.relationships.forEach((r) => m.set(r.id, r));
    return m;
  }, []);

  const selected = selectedRel ? relMap.get(selectedRel) : null;
  const selectedFrom = selected ? tableMap.get(selected.fromTable) : null;
  const selectedTo = selected ? tableMap.get(selected.toTable) : null;

  const showHint = !guideOpen && !selected && !hintDismissed;

  return (
    <div className="flex h-screen flex-col bg-ink-50">
      {/* Top bar */}
      <header className="z-30 flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="4"
                width="7"
                height="6"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <rect
                x="14"
                y="14"
                width="7"
                height="6"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M10 7h4M14 17h-4M10 7c0 6 4 4 4 10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight text-ink-900">
              ERD Studio
            </h1>
            <p className="text-[11px] leading-tight text-ink-500">
              Learn database relationships, visually
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setHintDismissed(false);
              setGuideOpen(true);
            }}
            className="hidden sm:inline text-[12px] text-ink-500 hover:text-ink-800 transition-colors"
          >
            New here? Start with the guide
          </a>
          <button
            onClick={() => {
              setGuideOpen((v) => !v);
              if (!guideOpen) setSelectedRel(null);
            }}
            className={[
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              guideOpen
                ? "bg-sky-600 text-white hover:bg-sky-500"
                : "bg-ink-100 text-ink-700 hover:bg-ink-200",
            ].join(" ")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M12 8h.01M11 11h1v5h1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Guide
          </button>
        </div>
      </header>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-auto">
        <div
          className="erd-grid relative mx-auto"
          style={{ width: CANVAS_W, height: CANVAS_H, minWidth: CANVAS_W }}
        >
          {/* Relationship lines (SVG layer) */}
          <svg
            className="absolute inset-0"
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ pointerEvents: "none" }}
          >
            <g style={{ pointerEvents: "all" }}>
              {SAMPLE_SCHEMA.relationships.map((r) => {
                const from = tableMap.get(r.fromTable)!;
                const to = tableMap.get(r.toTable)!;
                return (
                  <RelationshipLine
                    key={r.id}
                    rel={r}
                    fromTable={from}
                    toTable={to}
                    hovered={hoveredRel === r.id}
                    selected={selectedRel === r.id}
                    onHover={setHoveredRel}
                    onSelect={(id) => {
                      setSelectedRel(id);
                      setGuideOpen(false);
                    }}
                  />
                );
              })}
            </g>
          </svg>

          {/* Tables */}
          {SAMPLE_SCHEMA.tables.map((t) => (
            <TableCard key={t.id} table={t} />
          ))}

          {/* Onboarding hint */}
          {showHint && (
            <div className="panel-enter absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 rounded-full border border-ink-200 bg-white/95 px-4 py-2 shadow-lg backdrop-blur">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.5.5 1 1.2 1 2h6c0-.8.5-1.5 1-2A6 6 0 0012 3z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p className="text-[12px] text-ink-600">
                <span className="font-medium text-ink-900">Hover</span> a line
                for a quick label, <span className="font-medium text-ink-900">click</span> it for a full explanation.
              </p>
              <button
                onClick={() => setHintDismissed(true)}
                className="ml-1 text-ink-300 hover:text-ink-600 transition-colors"
                aria-label="Dismiss hint"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Guide panel */}
        <GuidePanel open={guideOpen} onClose={() => setGuideOpen(false)} />

        {/* Relationship properties panel */}
        {selected && selectedFrom && selectedTo && (
          <RelationshipPanel
            rel={selected}
            fromTable={selectedFrom}
            toTable={selectedTo}
            onClose={() => setSelectedRel(null)}
            onOpenGuide={() => {
              setSelectedRel(null);
              setGuideOpen(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
