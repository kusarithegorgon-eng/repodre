/**
 * ApiTestExportButton — Export API Test Suite Button
 *
 * A dropdown button in the App Journey header that exports all detected
 * controllers as a Postman Collection v2.1 JSON or HTTP file.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { FileCode2, ChevronDown, Check, Loader as Loader2, Send } from "lucide-react";
import type { DetectedController } from "@/lib/blueprint-analyzer";
import type { ParsedModule } from "@/lib/ast-parser";
import {
  generateTestEndpoints,
  generatePostmanCollection,
  generateHttpFile,
  downloadPostmanCollection,
  downloadHttpFile,
  type TestEndpoint,
} from "@/lib/api-test-generator";

interface ApiTestExportButtonProps {
  controllers: DetectedController[];
  modules: ParsedModule[];
  projectName: string;
  disabled?: boolean;
}

type ExportFormat = "postman" | "http";

export function ApiTestExportButton({
  controllers,
  modules,
  projectName,
  disabled,
}: ApiTestExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [justExported, setJustExported] = useState<ExportFormat | null>(null);
  const [endpointCount, setEndpointCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [isOpen]);

  useEffect(() => {
    const endpoints = generateTestEndpoints(controllers, modules);
    setEndpointCount(endpoints.length);
  }, [controllers, modules]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (controllers.length === 0) return;

      setIsExporting(true);
      try {
        const endpoints = generateTestEndpoints(controllers, modules);

        if (format === "postman") {
          const collection = generatePostmanCollection(endpoints, projectName);
          downloadPostmanCollection(collection, `${projectName.toLowerCase().replace(/\s+/g, "-")}-api-tests.postman_collection.json`);
        } else {
          const httpContent = generateHttpFile(endpoints, projectName);
          downloadHttpFile(httpContent, `${projectName.toLowerCase().replace(/\s+/g, "-")}-api-tests.http`);
        }

        setJustExported(format);
        setTimeout(() => setJustExported(null), 2000);
        setIsOpen(false);
      } catch (err) {
        console.error("Export failed:", err);
      } finally {
        setIsExporting(false);
      }
    },
    [controllers, modules, projectName]
  );

  const isDisabled = disabled || controllers.length === 0 || endpointCount === 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        disabled={isDisabled || isExporting}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-all hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isExporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        API Tests
        {endpointCount > 0 && (
          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {endpointCount}
          </span>
        )}
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-border bg-popover p-1.5 shadow-xl animate-fade-in">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Export test suite
          </p>
          <ExportOption
            icon={<FileCode2 className="h-4 w-4" />}
            label="Postman Collection"
            description="v2.1 JSON with mock payloads"
            onClick={() => handleExport("postman")}
            justExported={justExported === "postman"}
          />
          <ExportOption
            icon={<FileCode2 className="h-4 w-4" />}
            label="HTTP File"
            description="VS Code REST Client format"
            onClick={() => handleExport("http")}
            justExported={justExported === "http"}
          />
          {endpointCount === 0 && controllers.length > 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No testable endpoints detected from controllers.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ExportOption({
  icon,
  label,
  description,
  onClick,
  justExported,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  justExported: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
     data-tip="Export as Postman collection">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground">{description}</div>
      </div>
      {justExported && <Check className="h-4 w-4 shrink-0 text-teal" />}
    </button>
  );
}

export function ApiTestSuiteSummary({ endpoints }: { endpoints: TestEndpoint[] }) {
  if (endpoints.length === 0) return null;

  const methods: Record<string, number> = {};
  for (const ep of endpoints) {
    methods[ep.method] = (methods[ep.method] || 0) + 1;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {endpoints.length} endpoint{endpoints.length !== 1 ? "s" : ""}
      </span>
      {Object.entries(methods).map(([method, count]) => (
        <span
          key={method}
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
            method === "GET"
              ? "bg-green-500/10 text-green-500"
              : method === "POST"
              ? "bg-blue-500/10 text-blue-500"
              : method === "PUT" || method === "PATCH"
              ? "bg-amber-500/10 text-amber-500"
              : method === "DELETE"
              ? "bg-red-500/10 text-red-500"
              : "bg-surface text-muted-foreground"
          }`}
        >
          {method} {count}
        </span>
      ))}
    </div>
  );
}
