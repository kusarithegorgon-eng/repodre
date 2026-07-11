import { CARDINALITY_META, type ErdRelationship, type ErdTable } from "./data";

interface Props {
  rel: ErdRelationship;
  fromTable: ErdTable;
  toTable: ErdTable;
  onClose: () => void;
  onOpenGuide: () => void;
}

export function RelationshipPanel({
  rel,
  fromTable,
  toTable,
  onClose,
  onOpenGuide,
}: Props) {
  const meta = CARDINALITY_META[rel.cardinality];

  return (
    <aside className="panel-enter absolute right-4 top-4 bottom-4 z-20 w-[340px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl border border-ink-200 bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="inline-block rounded bg-ink-900 px-2 py-0.5 font-mono text-[12px] font-semibold text-white">
            {meta.short}
          </span>
          <h2 className="text-sm font-semibold text-ink-900">
            {meta.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
          aria-label="Close panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Connection summary */}
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">
            Connection
          </h3>
          <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5">
            <div className="text-center">
              <div className="font-mono text-[13px] font-semibold text-ink-900">
                {fromTable.name}
              </div>
              <div className="font-mono text-[11px] text-ink-500">
                {rel.fromField}
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center">
              <span className="font-mono text-[11px] font-semibold text-sky-600">
                {meta.short}
              </span>
              <svg width="60" height="10" viewBox="0 0 60 10">
                <line
                  x1="2"
                  y1="5"
                  x2="58"
                  y2="5"
                  stroke="#3b82f6"
                  strokeWidth="1.8"
                />
                <path
                  d="M52 1 L58 5 L52 9"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="1.8"
                />
              </svg>
            </div>
            <div className="text-center">
              <div className="font-mono text-[13px] font-semibold text-ink-900">
                {toTable.name}
              </div>
              <div className="font-mono text-[11px] text-ink-500">
                {rel.toField}
              </div>
            </div>
          </div>
        </section>

        {/* Plain English */}
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">
            In plain English
          </h3>
          <p className="text-[13px] leading-relaxed text-ink-700">
            {rel.plainEnglish}
          </p>
        </section>

        {/* What this means */}
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">
            What this means
          </h3>
          <p className="text-[13px] leading-relaxed text-ink-600">
            {meta.description}
          </p>
        </section>

        {/* Verify your logic */}
        <section className="rounded-lg bg-emerald-50 border border-emerald-100 px-3.5 py-3">
          <h3 className="text-[12px] font-semibold text-emerald-800 mb-1">
            Verify your logic
          </h3>
          <p className="text-[12px] leading-relaxed text-emerald-700">
            {meta.howToRead}
          </p>
        </section>
      </div>

      <footer className="border-t border-ink-100 px-5 py-3">
        <button
          onClick={onOpenGuide}
          className="w-full rounded-lg bg-ink-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-ink-800 transition-colors"
        >
          Open the full Guide
        </button>
      </footer>
    </aside>
  );
}
