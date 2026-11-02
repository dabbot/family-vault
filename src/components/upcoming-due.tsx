import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { daysUntil } from "@/lib/utils";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { Clock } from "lucide-react";

type Item = {
  id: string;
  title: string;
  expiry_date: string | null;
  storage_path: string;
  mime_type: string | null;
};

export function UpcomingDue() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [preview, setPreview] = useState<Item | null>(null);

  const load = () => {
    if (!user) return;
    const today = new Date();
    const in1y = new Date();
    in1y.setFullYear(in1y.getFullYear() + 1);
    const todayStr = today.toISOString().slice(0, 10);
    const endStr = in1y.toISOString().slice(0, 10);
    let q = supabase
      .from("documents")
      .select("id,title,expiry_date,storage_path,mime_type")
      .is("deleted_at", null)
      .not("expiry_date", "is", null)
      .gte("expiry_date", todayStr)
      .lte("expiry_date", endStr)
      .order("expiry_date", { ascending: true })
      .limit(10);
    if (!isAdmin) q = q.eq("owner_id", user.id);
    q.then(({ data }) => setItems((data ?? []) as Item[]));
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel(`upcoming-${user.id}-${isAdmin ? "all" : "own"}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        isAdmin
          ? { event: "*", schema: "public", table: "documents" }
          : { event: "*", schema: "public", table: "documents", filter: `owner_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin]);

  if (!user) return null;

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
        <Clock className="h-3 w-3" /> Upcoming · 1 yr
      </div>
      {items.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-sidebar-foreground/50">
          No expirations in the next year
        </div>
      ) : (
        <div className="space-y-0.5">
          {items.map((it) => {
            const n = daysUntil(it.expiry_date)!;
            return (
              <button
                key={it.id}
                onClick={() => setPreview(it)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              >
                <span className="truncate">{it.title}</span>
                <Badge variant={n <= 7 ? "destructive" : "secondary"} className="shrink-0 text-[10px]">
                  {n === 0 ? "today" : `${n}d`}
                </Badge>
              </button>
            );
          })}
        </div>
      )}
      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        title={preview?.title ?? ""}
        storagePath={preview?.storage_path ?? null}
        mimeType={preview?.mime_type ?? null}
      />
    </div>
  );
}
