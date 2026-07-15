import { useState } from "react";
import { Database, Upload, X, FileText } from "lucide-react";
import { parseSQL, type ParsedTable } from "@/lib/sql-parser";

interface SchemaInputProps {
  value: string;
  onValueChange: (v: string) => void;
  onSubmit: (tables: ParsedTable[], ddl: string) => void;
  onClose: () => void;
}

export function SchemaInput({ value, onValueChange, onSubmit, onClose }: SchemaInputProps) {
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleSubmit = () => {
    try {
      setError(null);
      if (!value.trim()) { setError("Please paste DDL or upload a .sql file"); return; }
      const tables = parseSQL(value);
      if (tables.length === 0) { setError("No CREATE TABLE statements found. The parser handles CREATE TABLE and FOREIGN KEY definitions."); return; }
      onSubmit(tables, value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse SQL");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        onValueChange(text);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to read file");
      }
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-xl border p-6 shadow-2xl animate-in"
        style={{ background: "var(--popover)", borderColor: "var(--border)" }}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-teal" style={{ color: "var(--teal)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Import DDL Schema</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent" style={{ color: "var(--muted-foreground)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "color-mix(in srgb, var(--red) 30%, transparent)", background: "color-mix(in srgb, var(--red) 10%, transparent)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {/* File uploader */}
        <div className="mb-4">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 transition-all hover:border-teal"
            style={{ borderColor: "var(--border)" }}>
            <Upload className="h-5 w-5" style={{ color: "var(--muted-foreground)" }} />
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {fileName ? <span className="flex items-center gap-1"><FileText className="h-4 w-4" /> {fileName}</span> : "Upload .sql file"}
            </span>
            <input type="file" accept=".sql,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* DDL textarea */}
        <textarea
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Paste CREATE TABLE statements here..."
          className="mb-4 h-48 w-full resize-none rounded-lg border p-3 font-mono text-sm outline-none focus:border-teal"
          style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
        />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-all hover:bg-accent"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
          <button onClick={handleSubmit} className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: "var(--teal)" }}>Import Schema</button>
        </div>
      </div>
    </div>
  );
}
