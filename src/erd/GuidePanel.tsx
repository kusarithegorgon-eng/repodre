import { CARDINALITY_META, type Cardinality } from "./data";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ORDER: Cardinality[] = ["1:1", "1:M", "M:N"];

const EXAMPLES: Record<Cardinality, { a: string; b: string; note: string }> = {
  "1:1": {
    a: "User",
    b: "Profile",
    note: "Each user has one profile; each profile belongs to one user.",
  },
  "1:M": {
    a: "Author",
    b: "Posts",
    note: "One author writes many posts; each post has one author.",
  },
  "M:N": {
    a: "Students",
    b: "Classes",
    note: "Many students enroll in many classes — via a join table.",
  },
};

export function GuidePanel({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <aside className="panel-enter absolute right-4 top-4 bottom-4 z-20 w-[360px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl border border-ink-200 bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">ERD Guide</h2>
          <p className="text-[11px] text-ink-500">
            Learn the symbols as you explore
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
          aria-label="Close guide"
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

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {/* What is an ERD */}
        <section>
          <h3 className="text-[13px] font-semibold text-ink-900 mb-1.5">
            What is an ERD?
          </h3>
          <p className="text-[13px] leading-relaxed text-ink-600">
            An Entity Relationship Diagram is the{" "}
            <span className="font-medium text-ink-900">blueprint</span> of your
            database. Each box is a table (an <em>entity</em>), each line is how
            two tables relate. Reading it tells you what data lives where and
            how it connects — before you write a single line of SQL.
          </p>
          <div className="mt-3 rounded-lg bg-sky-50 border border-sky-100 px-3 py-2.5">
            <p className="text-[12px] text-sky-800 leading-relaxed">
              <span className="font-semibold">Tip:</span> Think of it like an
              architect's floor plan. You wouldn't build a house without one —
              the same goes for a database.
            </p>
          </div>
        </section>

        {/* Legend */}
        <section>
          <h3 className="text-[13px] font-semibold text-ink-900 mb-2">
            Reading the symbols
          </h3>
          <ul className="space-y-2 text-[12px]">
            <li className="flex items-center gap-2.5">
              <span className="inline-flex h-5 w-8 items-center justify-center rounded bg-amber-50 text-amber-600 font-bold text-[10px]">
                PK
              </span>
              <span className="text-ink-600">
                <span className="font-medium text-ink-800">Primary key</span> —
                the unique ID for each row.
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="inline-flex h-5 w-8 items-center justify-center rounded bg-sky-50 text-sky-600 font-bold text-[10px]">
                FK
              </span>
              <span className="text-ink-600">
                <span className="font-medium text-ink-800">Foreign key</span> —
                a pointer to another table's primary key.
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <svg width="40" height="14" viewBox="0 0 40 14">
                <line
                  x1="4"
                  y1="2"
                  x2="4"
                  y2="12"
                  stroke="#4c5970"
                  strokeWidth="2"
                />
                <line
                  x1="4"
                  y1="7"
                  x2="34"
                  y2="7"
                  stroke="#818ea4"
                  strokeWidth="1.8"
                />
                <path
                  d="M34 7 L26 2 M34 7 L26 7 M34 7 L26 12"
                  fill="none"
                  stroke="#4c5970"
                  strokeWidth="2"
                />
              </svg>
              <span className="text-ink-600">
                The <span className="font-medium text-ink-800">bar</span> means
                "one"; the{" "}
                <span className="font-medium text-ink-800">crow's foot</span>{" "}
                means "many".
              </span>
            </li>
          </ul>
        </section>

        {/* Relationship table */}
        <section>
          <h3 className="text-[13px] font-semibold text-ink-900 mb-2">
            Relationship types
          </h3>
          <div className="overflow-hidden rounded-lg border border-ink-200">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-ink-50 text-ink-500">
                <tr>
                  <th className="px-2.5 py-1.5 font-medium">Type</th>
                  <th className="px-2.5 py-1.5 font-medium">Example</th>
                  <th className="px-2.5 py-1.5 font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {ORDER.map((c) => {
                  const m = CARDINALITY_META[c];
                  const ex = EXAMPLES[c];
                  return (
                    <tr key={c} className="align-top">
                      <td className="px-2.5 py-2">
                        <span className="inline-block rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
                          {m.short}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 font-mono text-ink-700">
                        {ex.a} ↔ {ex.b}
                      </td>
                      <td className="px-2.5 py-2 text-ink-600">{ex.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Detailed breakdowns */}
        <section className="space-y-3">
          {ORDER.map((c) => {
            const m = CARDINALITY_META[c];
            return (
              <div
                key={c}
                className="rounded-lg border border-ink-200 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
                    {m.short}
                  </span>
                  <h4 className="text-[13px] font-semibold text-ink-900">
                    {m.name}
                  </h4>
                  <span className="ml-auto text-[11px] text-ink-400">
                    e.g. {m.example}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-ink-600">
                  {m.description}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">
                  <span className="font-medium text-ink-700">How to read:</span>{" "}
                  {m.howToRead}
                </p>
              </div>
            );
          })}
        </section>

        <p className="text-[11px] text-ink-400 pt-1">
          Hover a connector line for a quick label, or click it for a full
          plain-English explanation.
        </p>
      </div>
    </aside>
  );
}
