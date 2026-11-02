import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Clock, AlertTriangle, Folder, Copy, IdCard } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFamilySlots, type FamilySlot } from "@/lib/family-slots";
import { SlotIcon } from "@/components/slot-icon";
import { formatBytes, formatDate, daysUntil, cn } from "@/lib/utils";
import { toast } from "sonner";
import { FileThumb } from "@/components/file-thumb";
import { UpcomingDue } from "@/components/upcoming-due";

import { useServerFn } from "@tanstack/react-start";
import { reprocessPendingDocuments } from "@/lib/documents.functions";

// Lazy-load heavy below-the-fold / on-demand components so the initial bundle
// stays small and the first paint happens sooner.
const UploadDialog = lazy(() =>
  import("@/components/upload-dialog").then((m) => ({ default: m.UploadDialog })),
);
const FilePreviewDialog = lazy(() =>
  import("@/components/file-preview-dialog").then((m) => ({ default: m.FilePreviewDialog })),
);
const FamilyEmail = lazy(() =>
  import("@/components/family-email").then((m) => ({ default: m.FamilyEmail })),
);

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — Family Vault" }] }),
  component: HomePage,
});

type Doc = {
  id: string;
  title: string;
  mime_type: string | null;
  size_bytes: number | null;
  expiry_date: string | null;
  is_favorite: boolean;
  created_at: string;
  ai_summary: string | null;
  storage_path: string;
  category_id: string | null;
};
type Cat = { id: string; slug: string; name: string; icon: string };

const SEL = "id,title,mime_type,size_bytes,expiry_date,is_favorite,created_at,ai_summary,storage_path,category_id";

function HomePage() {
  const { user, profile } = useAuth();

  // Per-section state + loaded flag so each block paints as it arrives.
  const [recents, setRecents] = useState<Doc[]>([]);
  const [recentsLoaded, setRecentsLoaded] = useState(false);
  const [favs, setFavs] = useState<Doc[]>([]);
  const { slots, slotName } = useFamilySlots();
  const [favsLoaded, setFavsLoaded] = useState(false);
  const [cats, setCats] = useState<Cat[]>([]);
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [expiring, setExpiring] = useState<Doc[]>([]);
  const [quickView, setQuickView] = useState<Array<{ id: string; doc_type: string; doc_number: string; family_slot: FamilySlot; member_name: string | null; title: string }>>([]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [preview, setPreview] = useState<Doc | null>(null);
  // Defer the below-the-fold FamilyEmail until the page has painted.
  const [showFamilyEmail, setShowFamilyEmail] = useState(false);

  const loadRecents = async () => {
    if (!user) return;
    const { data } = await supabase.from("documents").select(SEL).eq("owner_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(5);
    setRecents((data ?? []) as Doc[]);
    setRecentsLoaded(true);
  };
  const loadFavs = async () => {
    if (!user) return;
    const { data } = await supabase.from("documents").select(SEL).eq("owner_id", user.id).is("deleted_at", null).eq("is_favorite", true).limit(6);
    setFavs((data ?? []) as Doc[]);
    setFavsLoaded(true);
  };
  const loadCats = async () => {
    const { data } = await supabase.from("categories").select("*").order("sort_order");
    setCats((data ?? []) as Cat[]);
  };
  const loadSlotCounts = async () => {
    const { data } = await supabase.from("documents").select("family_slot").is("deleted_at", null);
    const m: Record<string, number> = {};
    ((data ?? []) as { family_slot: string }[]).forEach((row) => {
      if (row.family_slot) m[row.family_slot] = (m[row.family_slot] ?? 0) + 1;
    });
    setSlotCounts(m);
    setSlotsLoaded(true);
  };
  const loadExpiring = async () => {
    if (!user) return;
    const { data } = await supabase.from("documents").select(SEL).eq("owner_id", user.id).is("deleted_at", null).not("expiry_date", "is", null).order("expiry_date").limit(5);
    setExpiring(((data ?? []) as Doc[]).filter((d) => {
      const n = daysUntil(d.expiry_date);
      return n !== null && n <= 60;
    }));
  };
  const loadQuickView = async () => {
    const { data } = await supabase
      .from("documents")
      .select("id,doc_type,doc_number,family_slot,member_name,title")
      .is("deleted_at", null)
      .not("doc_number", "is", null)
      .order("family_slot");
    const allowed = new Set(["passport", "aadhaar", "pan"]);
    setQuickView(((data ?? []) as Array<{ id: string; doc_type: string | null; doc_number: string | null; family_slot: FamilySlot; member_name: string | null; title: string }>).filter(
      (q) => q.doc_type && q.doc_number && allowed.has(q.doc_type),
    ) as typeof quickView);
  };

  const reloadAll = () => {
    loadRecents(); loadFavs(); loadCats(); loadSlotCounts(); loadExpiring(); loadQuickView();
  };

  const reprocess = useServerFn(reprocessPendingDocuments);

  // Fire queries in parallel but each updates state independently → sections
  // paint as they arrive instead of all at once.
  useEffect(() => {
    if (!user) return;
    loadRecents();
    loadSlotCounts();
    loadCats();
    loadExpiring();
    loadFavs();
    loadQuickView();
    // Defer mounting FamilyEmail until after first paint settles.
    const t = setTimeout(() => setShowFamilyEmail(true), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    reprocess({})
      .then((r) => {
        if (r?.processed > 0) {
          const okCount = r.results.filter((x) => x.ok).length;
          if (okCount > 0) {
            toast.success(`Analyzed ${okCount} document${okCount === 1 ? "" : "s"}`);
            loadRecents();
            loadFavs();
            loadExpiring();
          }
          const errs = r.results.filter((x) => !x.ok);
          if (errs.length) console.warn("Reprocess errors", errs);
        }
      })
      .catch((e) => console.warn("Reprocess failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggleFav = async (id: string, val: boolean) => {
    await supabase.from("documents").update({ is_favorite: val }).eq("id", id);
    loadRecents();
    loadFavs();
  };

  if (!user) return null;

  return (
    <AppShell onUpload={() => setUploadOpen(true)}>
      <div className="mb-8 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Here's what's new in your vault.</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setQuickOpen(true)}
          aria-label="Quick View"
          title="Quick View"
          className="shrink-0"
        >
          <IdCard className="h-4 w-4" />
        </Button>
      </div>

      {expiring.length > 0 && (
        <Card className="mb-6 border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-warning-foreground" />
            <div className="flex-1">
              <div className="font-medium">Coming up for renewal</div>
              <div className="mt-2 space-y-1.5">
                {expiring.map((d) => {
                  const n = daysUntil(d.expiry_date)!;
                  return (
                    <Link key={d.id} to="/folders" className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-background/50">
                      <span className="truncate">{d.title}</span>
                      <Badge variant={n < 0 ? "destructive" : n <= 7 ? "destructive" : "secondary"}>
                        {n < 0 ? `expired ${-n}d ago` : n === 0 ? "today" : `in ${n}d`}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Family</h2>
          <Link to="/folders" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {slots.length === 0 ? (
            <Card className="col-span-full p-4 text-sm text-muted-foreground">
              No family members yet.{" "}
              <Link to="/setup" className="text-primary hover:underline">Add your family</Link>
            </Card>
          ) : null}
          {slots.map((s) => {
            return (
              <Link key={s.slot} to="/folders" search={{ slot: s.slot as FamilySlot, folder: undefined }}>
                <Card className="group flex h-full flex-col gap-2 p-4 transition hover:shadow-card hover:-translate-y-0.5">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary">
                    <SlotIcon slot={s} className="h-5 w-5" />
                  </div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {slotsLoaded ? `${slotCounts[s.slot] ?? 0} files` : <span className="inline-block h-3 w-10 animate-pulse rounded bg-muted" />}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quick View</DialogTitle>
          </DialogHeader>
          {quickView.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No Passport, Aadhaar or PAN numbers found.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {quickView.map((q) => {
                const label =
                  q.doc_type === "pan" ? "PAN" : q.doc_type === "aadhaar" ? "Aadhaar" : "Passport";
                const who = q.member_name || slotName(q.family_slot);
                return (
                  <div key={q.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        <span className="font-medium">{who}</span>
                        <span className="text-muted-foreground"> · {label}</span>
                      </div>
                      <div className="font-mono text-sm tracking-wide">{q.doc_number}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(q.doc_number);
                        toast.success("Copied");
                      }}
                      aria-label="Copy"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mobile-only upcoming */}
      <section className="mb-8 md:hidden">
        <Card className="p-0">
          <UpcomingDue />
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Recent files</h2>
        {!recentsLoaded ? (
          <Card className="divide-y divide-border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <div className="h-10 w-10 animate-pulse rounded bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted/70" />
                </div>
              </div>
            ))}
          </Card>
        ) : recents.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No files yet. Tap <span className="font-medium text-foreground">Upload</span> to add your first document.
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {recents.map((d) => (
              <DocRow key={d.id} d={d} cats={cats} onFav={toggleFav} onOpen={setPreview} />
            ))}
          </Card>
        )}
      </section>

      {favsLoaded && favs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Favorites</h2>
          <Card className="divide-y divide-border">
            {favs.map((d) => <DocRow key={d.id} d={d} cats={cats} onFav={toggleFav} onOpen={setPreview} />)}
          </Card>
        </section>
      )}

      {showFamilyEmail && (
        <Suspense fallback={null}>
          <FamilyEmail />
        </Suspense>
      )}

      <Suspense fallback={null}>
        {preview && (
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
            onChanged={reloadAll}
          />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {uploadOpen && (
          <UploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            categories={cats}
            ownerId={user.id}
            onUploaded={reloadAll}
          />
        )}
      </Suspense>
    </AppShell>
  );
}

function DocRow({ d, cats, onFav, onOpen }: { d: Doc; cats: Cat[]; onFav: (id: string, v: boolean) => void; onOpen: (d: Doc) => void }) {
  const n = daysUntil(d.expiry_date);
  const folder = cats.find((c) => c.id === d.category_id);
  return (
    <div className="flex items-center gap-3 p-3">
      <FileThumb storagePath={d.storage_path} mimeType={d.mime_type} />
      <button onClick={() => onOpen(d)} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium hover:underline">{d.title}</span>
          {n !== null && n <= 30 && (
            <Badge variant={n < 0 || n <= 7 ? "destructive" : "secondary"} className="shrink-0">
              <Clock className="mr-1 h-3 w-3" />
              {n < 0 ? `expired` : n === 0 ? "expires today" : `${n}d left`}
            </Badge>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {d.ai_summary ?? `Uploaded ${formatDate(d.created_at)}`} · {formatBytes(d.size_bytes)}
        </div>
        {folder && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Folder className="h-3 w-3" />
            <span className="truncate">{folder.name}</span>
          </div>
        )}
      </button>
      <Button variant="ghost" size="icon" onClick={() => onFav(d.id, !d.is_favorite)} aria-label="Favorite">
        <Star className={cn("h-4 w-4", d.is_favorite && "fill-warning text-warning")} />
      </Button>
    </div>
  );
}
