import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatBytes, formatDate } from "@/lib/utils";
import { FileThumb } from "@/components/file-thumb";

export const Route = createFileRoute("/_authenticated/trash")({
  head: () => ({ meta: [{ title: "Trash — Family Vault" }] }),
  component: TrashPage,
});

type Doc = {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  deleted_at: string;
};

function TrashPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("documents")
      .select("id,title,storage_path,mime_type,size_bytes,deleted_at")
      .eq("owner_id", user.id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    setDocs((data ?? []) as Doc[]);
  };

  useEffect(() => { load(); }, [user]);

  const restore = async (d: Doc) => {
    await supabase.from("documents").update({ deleted_at: null }).eq("id", d.id);
    toast.success("Restored");
    load();
  };

  const purge = async (d: Doc) => {
    if (!confirm(`Permanently delete "${d.title}"? This cannot be undone.`)) return;
    await supabase.storage.from("documents").remove([d.storage_path]);
    await supabase.from("reminders").delete().eq("document_id", d.id);
    await supabase.from("documents").delete().eq("id", d.id);
    toast.success("Permanently deleted");
    load();
  };

  if (!user) return null;

  return (
    <AppShell>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight md:text-3xl">Trash</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Deleted files can be restored from here. Use “Delete forever” to remove permanently.
      </p>
      {docs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Trash is empty.</Card>
      ) : (
        <Card className="divide-y divide-border">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-3">
              <FileThumb storagePath={d.storage_path} mimeType={d.mime_type} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  Deleted {formatDate(d.deleted_at)} · {formatBytes(d.size_bytes)}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => restore(d)} className="gap-1">
                <RotateCcw className="h-4 w-4" /> Restore
              </Button>
              <Button variant="ghost" size="icon" onClick={() => purge(d)} aria-label="Delete forever">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
