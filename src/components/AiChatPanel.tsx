/**
 * AiChatPanel — Live AI Architecture Assistant
 *
 * Calls the groq-chat edge function (which proxies to Groq's Llama 3.3 70B)
 * with the four anti-hallucination protocols baked into the system prompt.
 * The API key never touches the frontend — all requests go through the
 * Supabase edge function.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { X, Send, Loader as Loader2, Sparkles, Shield, MessageSquare, GitBranch, Bug, FileCode as FileCode2, CircleAlert as AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  context?: {
    projectId?: string | null;
    nodeCount?: number;
    edgeCount?: number;
    workspace?: string;
  };
}

const QUICK_PROMPTS = [
  {
    id: "grounding",
    icon: Shield,
    label: "Architectural Grounding",
    prompt: "Explain how the canvas node deletion flow works. Use the Think-Act-Observe pattern and cite the specific files responsible for each step.",
  },
  {
    id: "socratic",
    icon: MessageSquare,
    label: "Socratic Audit",
    prompt: "Act as a Senior Architect. Ask me three deep-dive questions about the interaction between the Collaboration Hub and the Repository State. Your questions should force me to explain why a specific data flow exists.",
  },
  {
    id: "visual",
    icon: GitBranch,
    label: "Visual Mapping",
    prompt: "Construct a Mermaid.js sequence diagram representing the flow of a user comment through the Annotation Layer to the Database. Do not output text until the diagram accurately reflects the current node-based schema of our app.",
  },
  {
    id: "constraint",
    icon: Bug,
    label: "Constraint Debugging",
    prompt: "I want to add a new 'duplicate node' feature. Provide a Constraint Analysis: which system node does this impact, what is the ripple effect on RBAC permissions, and why is this approach better than adding it as a frontend-only operation?",
  },
];

export function AiChatPanel({ isOpen, onClose, context }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setError("You must be signed in to use the AI assistant.");
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/groq-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            context,
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.error) throw new Error(data.error);

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.message || "No response received.",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get AI response.");
    } finally {
      setLoading(false);
    }
  }, [messages, loading, context]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 top-20 z-50 flex h-[600px] max-h-[80vh] w-[420px] flex-col rounded-2xl border border-border bg-popover/95 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/10">
            <Sparkles className="h-4 w-4 text-teal" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Architecture Assistant</h3>
            <p className="text-[10px] text-muted-foreground">Powered by Groq · Llama 3.3 70B</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-background p-2 text-muted-foreground transition hover:border-teal hover:text-teal"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <FileCode2 className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="mb-1 text-sm font-medium text-foreground">Ask about your architecture</p>
            <p className="mb-4 text-xs text-muted-foreground">
              The AI follows four anti-hallucination protocols and cites real files.
            </p>

            {/* Quick prompts */}
            <div className="grid w-full grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((qp) => {
                const Icon = qp.icon;
                return (
                  <button
                    key={qp.id}
                    onClick={() => sendMessage(qp.prompt)}
                    className="flex flex-col items-start gap-1.5 rounded-xl border border-border bg-background p-3 text-left transition-all hover:border-teal/40 hover:bg-teal/5"
                  >
                    <Icon className="h-4 w-4 text-teal" />
                    <span className="text-[11px] font-medium text-foreground">{qp.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-teal text-white"
                  : "border border-border bg-surface text-foreground"
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-teal" />
              <span className="text-xs text-muted-foreground">Analyzing architecture...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your architecture..."
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-teal disabled:opacity-50"
            style={{ maxHeight: "100px" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          AI responses follow the 4 anti-hallucination protocols · Press Enter to send
        </p>
      </div>
    </div>
  );
}
