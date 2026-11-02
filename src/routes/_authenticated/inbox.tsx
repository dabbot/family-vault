import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Check, Inbox as InboxIcon } from "lucide-react";
import { toast } from "sonner";
import { FileThumb } from "@/components/file-thumb";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Smart Inbox — Family Vault" }] }),
  component: InboxPage,
});

type Doc = {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  category_id: string | null;
  doc_type: string | null;
  expiry_date: string | null;
  ai_summary: string | null;
  created_at: string;
  size_bytes: number | null;
};
type Cat = { id: string; slug: string; name: string };

function InboxPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Doc[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [preview, setPreview] = useState<Doc | null>(null);

  const load = async () => {
    if (!user) return;
    const [d, c] = await Promise.all([
      supabase
        .from("documents")
        .select("id,title,storage_path,mime_type,category_id,doc_type,expiry_date,ai_summary,created_at,size_bytes")
        .eq("owner_id", user.id)
        .is("deleted_at", null)
        .eq("needs_review", true)
        .order("created_at", { ascending: false }),
      supabase.from("categories").select("id,slug,name").order("sort_order"),
    ]);
    setItems((d.data ?? []) as Doc[]);
    setCats((c.data ?? []) as Cat[]);
  };

  useEffect(() => { load(); }, [user]);

  const updateField = async (id: string, patch: Partial<Doc> & { needs_review?: boolean }) => {
    await supabase.from("documents").update(patch).eq("id", id);
  };

  const markReviewed = async (id: string) => {
    await updateField(id, { needs_review: false });
    toast.success("Marked as reviewed");
    load();
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary">
          <InboxIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Smart Inbox</h1>
          <p className="text-sm text-muted-foreground">Files where AI couldn't confidently fill key details. Confirm or fix, then mark reviewed.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          🎉 Inbox zero. Nothing needs review.
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <button onClick={() => setPreview(d)} className="shrink-0">
                  <FileThumb storagePath={d.storage_path} mimeType={d.mime_type} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setPreview(d)} className="truncate text-left font-medium hover:underline">{d.title}</button>
                    {!d.category_id && <Badge variant="destructive">missing folder</Badge>}
                    {!d.doc_type && <Badge variant="secondary">missing type</Badge>}
                    {!d.expiry_date && <Badge variant="secondary">no expiry found</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {d.ai_summary ?? `Uploaded ${formatDate(d.created_at)}`}
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Folder</label>
                      <Select
                        value={d.category_id ?? ""}
                        onValueChange={(v) => updateField(d.id, { category_id: v }).then(load)}
                      >
                        <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                        <SelectContent>
                          {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Expires</label>
                      <Input
                        type="date"
                        defaultValue={d.expiry_date ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== d.expiry_date) updateField(d.id, { expiry_date: v }).then(load);
                        }}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={() => markReviewed(d.id)} className="w-full gap-2">
                        <Check className="h-4 w-4" /> Mark reviewed
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        title={preview?.title ?? ""}
        storagePath={preview?.storage_path ?? null}
        mimeType={preview?.mime_type ?? null}
        documentId={preview?.id ?? null}
        ownerId={user.id}
        sizeBytes={preview?.size_bytes ?? null}
        updatedAt={preview?.created_at ?? null}
        onChanged={load}
      />
    </AppShell>
  );
}
