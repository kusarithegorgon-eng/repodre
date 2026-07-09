import { useMemo, useState } from "react";
import { X, MessageCircle, Plus, BookOpen } from "lucide-react";

interface Annotation {
  id: string;
  projectId: string;
  nodeId: string;
  authorId: string | null;
  authorName: string;
  body: {
    type: "TextualBody";
    value: string;
    format: "text/plain";
  };
  target: {
    type: "CanvasNode";
    id: string;
    selector: {
      type: "NodeIdSelector";
      value: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

interface NodeTarget {
  nodeId: string;
  label: string;
  sub: string;
}

interface AnnotationPanelProps {
  isOpen: boolean;
  selectedNode: NodeTarget | null;
  annotations: Annotation[];
  onClose: () => void;
  onCreateAnnotation: (nodeId: string, body: string) => Promise<void>;
  onDeleteAnnotation: (annotationId: string) => Promise<void>;
  canComment: boolean;
}

export function AnnotationPanel({
  isOpen,
  selectedNode,
  annotations,
  onClose,
  onCreateAnnotation,
  onDeleteAnnotation,
  canComment,
}: AnnotationPanelProps) {
  const [draft, setDraft] = useState("");
  const selectedAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.nodeId === selectedNode?.nodeId),
    [annotations, selectedNode]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 top-20 z-50 w-[340px] rounded-3xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BookOpen className="h-4 w-4" />
            Canvas Annotations
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Attach comments to a node and keep discussion linked to the canvas.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-background p-2 text-muted-foreground transition hover:border-teal hover:text-teal"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!selectedNode ? (
        <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Select a node to view or add annotations.
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-2xl bg-surface p-3 text-sm">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Target node</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{selectedNode.label}</div>
            <div className="text-[11px] text-muted-foreground">{selectedNode.sub}</div>
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Comments</div>
            <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal">
              {selectedAnnotations.length}
            </span>
          </div>

          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {selectedAnnotations.length === 0 ? (
              <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                No annotations yet. Add one to anchor discussion to this node.
              </div>
            ) : (
              selectedAnnotations.map((annotation) => (
                <div key={annotation.id} className="rounded-2xl border border-border bg-surface p-3">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{annotation.authorName}</span>
                    <button
                      onClick={() => onDeleteAnnotation(annotation.id)}
                      className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="mt-2 text-sm text-foreground">{annotation.body.value}</div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {annotation.createdAt.toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-background p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageCircle className="h-4 w-4" />
              Add comment
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={canComment ? "Write a comment tied to the selected node..." : "View-only mode: commenting is disabled."}
              className="min-h-[96px] w-full resize-none rounded-2xl border border-border bg-background p-3 text-sm text-foreground outline-none transition focus:border-teal"
              disabled={!canComment}
            />
            <button
              disabled={!canComment || draft.trim() === ""}
              onClick={async () => {
                if (!selectedNode) return;
                await onCreateAnnotation(selectedNode.nodeId, draft.trim());
                setDraft("");
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal px-3 py-2 text-sm font-semibold text-teal-foreground transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add annotation
            </button>
          </div>
        </>
      )}

      {selectedNode && (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface p-3 text-xs text-muted-foreground">
          <div className="mb-2 uppercase tracking-[0.18em]">Standard model</div>
          <pre className="whitespace-pre-wrap break-words text-[11px] leading-5">
{JSON.stringify(
  {
    "@context": "http://www.w3.org/ns/anno.jsonld",
    type: "Annotation",
    body: {
      type: "TextualBody",
      value: "User comment text",
      format: "text/plain",
    },
    target: {
      id: selectedNode.nodeId,
      type: "CanvasNode",
      selector: {
        type: "NodeIdSelector",
        value: selectedNode.nodeId,
      },
    },
  },
  null,
  2
)}
          </pre>
        </div>
      )}
    </div>
  );
}

interface OverlayNodeData {
  id: string;
  x: number;
  y: number;
}

interface AnnotationOverlayProps {
  nodes: OverlayNodeData[];
  annotations: Annotation[];
  onSelectNode: (nodeId: string) => void;
}

export function AnnotationOverlay({ nodes, annotations, onSelectNode }: AnnotationOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      {nodes.map((node) => {
        const nodeAnnotations = annotations.filter((annotation) => annotation.nodeId === node.id);
        if (nodeAnnotations.length === 0) return null;
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectNode(node.id)}
            className="pointer-events-auto absolute inline-flex items-center gap-1 rounded-full border border-teal/30 bg-teal/10 px-2 py-1 text-[11px] font-semibold text-teal transition hover:bg-teal/20"
            style={{ left: node.x + 16, top: node.y - 18 }}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {nodeAnnotations.length}
          </button>
        );
      })}
    </div>
  );
}
