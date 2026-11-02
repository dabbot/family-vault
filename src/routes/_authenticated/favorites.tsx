import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, FileText, Download } from "lucide-react";
import { formatBytes, formatDate, cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({ meta: [{ title: "Favorites — Family Vault" }] }),
  component: FavPage,
});

type Doc = { id: string; title: string; storage_path: string; size_bytes: number | null; is_favorite: boolean; created_at: string };

function FavPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("documents").select("id,title,storage_path,size_bytes,is_favorite,created_at").eq("owner_id", user.id).eq("is_favorite", true).is("deleted_at", null).order("created_at", { ascending: false });
    setDocs((data ?? []) as Doc[]);
  };
  useEffect(() => { load(); }, [user]);

  const open = async (p: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(p, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  const unfav = async (id: string) => { await supabase.from("documents").update({ is_favorite: false }).eq("id", id); load(); };

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight md:text-3xl">Favorites</h1>
      {docs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No favorites yet. Star documents to keep them here.</Card>
      ) : (
        <Card className="divide-y divide-border">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground"><FileText className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.title}</div>
                <div className="text-xs text-muted-foreground">{formatDate(d.created_at)} · {formatBytes(d.size_bytes)}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => open(d.storage_path)}><Download className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => unfav(d.id)}><Star className={cn("h-4 w-4 fill-warning text-warning")} /></Button>
            </div>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
