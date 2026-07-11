import type { ErdTable } from "./data";

interface Props {
  table: ErdTable;
  highlightedField?: string;
  onFieldClick?: (tableId: string, fieldName: string) => void;
}

const typeColor: Record<string, string> = {
  uuid: "text-sky-600",
  text: "text-emerald-600",
  int: "text-amber-600",
  timestamp: "text-violet-600",
  date: "text-violet-600",
};

export function TableCard({ table, highlightedField, onFieldClick }: Props) {
  return (
    <div
      className="absolute rounded-xl border border-ink-200 bg-white shadow-sm overflow-hidden select-none"
      style={{ left: table.x, top: table.y, width: table.width }}
    >
      <div className="flex items-center gap-2 bg-ink-900 px-3 py-2">
        <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
        <span className="font-mono text-sm font-semibold text-white">
          {table.name}
        </span>
      </div>
      <ul className="divide-y divide-ink-100">
        {table.fields.map((f) => {
          const active = highlightedField === f.name;
          return (
            <li
              key={f.name}
              onClick={() => onFieldClick?.(table.id, f.name)}
              className={[
                "flex items-center gap-2 px-3 py-1.5 text-[13px] transition-colors",
                active
                  ? "bg-sky-50"
                  : "hover:bg-ink-50 cursor-default",
              ].join(" ")}
            >
              <span className="w-5 text-center shrink-0">
                {f.pk && (
                  <span
                    title="Primary key"
                    className="text-amber-500 font-bold"
                  >
                    PK
                  </span>
                )}
                {f.fk && (
                  <span title="Foreign key" className="text-sky-500 font-bold">
                    FK
                  </span>
                )}
              </span>
              <span
                className={[
                  "font-mono",
                  f.pk ? "font-semibold text-ink-900" : "text-ink-700",
                ].join(" ")}
              >
                {f.name}
              </span>
              <span
                className={[
                  "ml-auto font-mono text-[11px]",
                  typeColor[f.type] ?? "text-ink-500",
                ].join(" ")}
              >
                {f.type}
              </span>
              {f.nullable === false && (
                <span className="text-ink-300 text-[11px]" title="Not null">
                  •
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
