import { useEffect, useState } from "react";
import { Search, FileText } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { formatDate } from "@/lib/utils";

type Hit = {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  ai_summary: string | null;
  issuer: string | null;
  doc_number: string | null;
  created_at: string;
};

export function GlobalSearch() {
  const { user, isFamilyMember } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Hit | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!user || !open) return;
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const pat = `%${term.replace(/[%_]/g, "\\$&")}%`;
      let query = supabase
        .from("documents")
        .select("id,title,storage_path,mime_type,ai_summary,issuer,doc_number,created_at")
        .is("deleted_at", null)
        .or(`title.ilike.${pat},ai_summary.ilike.${pat},issuer.ilike.${pat},doc_number.ilike.${pat},ocr_text.ilike.${pat}`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!isFamilyMember) query = query.eq("owner_id", user.id);
      const { data } = await query;
      setHits((data ?? []) as Hit[]);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, user, isFamilyMember]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="ml-2 hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono sm:inline">⌘K</kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search title, summary, issuer, number…" value={q} onValueChange={setQ} />
        <CommandList>
          {loading && <div className="p-4 text-center text-xs text-muted-foreground">Searching…</div>}
          {!loading && q.trim().length >= 2 && hits.length === 0 && (
            <CommandEmpty>No matches.</CommandEmpty>
          )}
          {!loading && q.trim().length < 2 && (
            <div className="p-4 text-center text-xs text-muted-foreground">Type at least 2 characters.</div>
          )}
          {hits.length > 0 && (
            <CommandGroup heading={`${hits.length} result${hits.length === 1 ? "" : "s"}`}>
              {hits.map((h) => (
                <CommandItem
                  key={h.id}
                  value={`${h.title} ${h.issuer ?? ""} ${h.doc_number ?? ""} ${h.id}`}
                  onSelect={() => { setOpen(false); setPreview(h); }}
                  className="flex items-start gap-3"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{h.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {h.ai_summary ?? [h.issuer, h.doc_number].filter(Boolean).join(" · ") ?? formatDate(h.created_at)}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        title={preview?.title ?? ""}
        storagePath={preview?.storage_path ?? null}
        mimeType={preview?.mime_type ?? null}
      />
    </>
  );
}
