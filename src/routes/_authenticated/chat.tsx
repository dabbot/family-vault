import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { askVault, clearChatHistory } from "@/lib/chat.functions";
import { FilePreviewDialog } from "@/components/file-preview-dialog";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Ask your vault — Family Vault" }] }),
  component: ChatPage,
});

type Citation = { index: number; id: string; title: string; doc_type: string | null };
type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
  created_at: string;
};

const SUGGESTIONS = [
  "When does my passport expire?",
  "What's my car insurance policy number?",
  "Show me all documents expiring this year",
  "Whose PAN card do I have?",
];

function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ id: string; title: string; storage_path: string; mime_type: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ask = useServerFn(askVault);
  const clear = useServerFn(clearChatHistory);

  const loadHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_messages")
      .select("id,role,content,citations,created_at")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(50);
    setMessages((data ?? []) as Msg[]);
  };

  useEffect(() => { loadHistory(); }, [user]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || busy || !user) return;
    setInput("");
    const tempUser: Msg = { id: `tmp-${Date.now()}`, role: "user", content: question, created_at: new Date().toISOString() };
    setMessages((m) => [...m, tempUser]);
    setBusy(true);
    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const res = await ask({ data: { question, history } });
      const tempAssistant: Msg = {
        id: `tmp-a-${Date.now()}`,
        role: "assistant",
        content: res.answer,
        citations: res.citations,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, tempAssistant]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to ask");
    } finally {
      setBusy(false);
    }
  };

  const openCitation = async (id: string) => {
    const { data } = await supabase
      .from("documents")
      .select("id,title,storage_path,mime_type")
      .eq("id", id)
      .maybeSingle();
    if (data) setPreview(data as typeof preview);
  };

  const reset = async () => {
    if (!confirm("Clear this conversation?")) return;
    await clear({});
    setMessages([]);
    toast.success("Chat cleared");
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ask your vault</h1>
            <p className="text-sm text-muted-foreground">Ask anything about your documents in plain English.</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={reset} className="gap-2">
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      <Card className="flex h-[calc(100vh-15rem)] flex-col p-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 && (
            <div className="mx-auto max-w-md py-10 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="font-semibold">Try asking…</h2>
              <p className="mt-1 text-sm text-muted-foreground">I'll search your documents and cite the source.</p>
              <div className="mt-5 grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-lg border border-border bg-card px-4 py-2.5 text-left text-sm transition hover:border-primary/40 hover:bg-primary-soft/30"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-5">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                    : "max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm"
                }>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-li:my-0">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                  {m.role === "assistant" && m.citations && m.citations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                      {m.citations.map((c) => (
                        <button
                          key={c.index}
                          onClick={() => openCitation(c.id)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-[11px] font-medium text-foreground/80 transition hover:bg-background"
                        >
                          <FileText className="h-3 w-3" />
                          <span>[{c.index}] {c.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border bg-card p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Ask anything about your documents…"
              rows={1}
              className="min-h-[44px] max-h-32 resize-none"
              disabled={busy}
            />
            <Button onClick={() => send()} disabled={busy || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            Answers are based only on documents you have access to. <Badge variant="outline" className="ml-1 text-[10px]">AI</Badge>
          </div>
        </div>
      </Card>

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        title={preview?.title ?? ""}
        storagePath={preview?.storage_path ?? null}
        mimeType={preview?.mime_type ?? null}
        documentId={preview?.id ?? null}
        ownerId={user.id}
      />
    </AppShell>
  );
}
