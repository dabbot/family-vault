import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { UploadDialog } from "@/components/upload-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Download, Star, Trash2, ChevronLeft, Folder, FolderPlus, Move, Pencil } from "lucide-react";
import { formatBytes, formatDate, daysUntil, cn } from "@/lib/utils";
import { toast } from "sonner";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { FileThumb } from "@/components/file-thumb";
import { useFamilySlots, type FamilySlot } from "@/lib/family-slots";
import { SlotIcon } from "@/components/slot-icon";
import { readNavCache, writeNavCache, invalidateNavCache } from "@/lib/nav-cache";

export const Route = createFileRoute("/_authenticated/folders")({
  head: () => ({ meta: [{ title: "Family — Family Vault" }] }),
  validateSearch: (s: Record<string, unknown>): { slot?: FamilySlot; folder?: string } => ({
    slot: typeof s.slot === "string" ? (s.slot as FamilySlot) : undefined,
    folder: typeof s.folder === "string" ? s.folder : undefined,
  }),
  component: FoldersPage,
});

type FolderRow = { id: string; family_slot: FamilySlot; parent_id: string | null; name: string; created_by: string };
type Cat = { id: string; name: string; slug: string; icon: string };
type Doc = { id: string; title: string; storage_path: string; size_bytes: number | null; is_favorite: boolean; created_at: string; expiry_date: string | null; category_id: string | null; ai_summary: string | null; mime_type: string | null; owner_id: string; family_slot: FamilySlot; folder_id: string | null };

function FoldersPage() {
  const { user } = useAuth();
  const { slots, slotName } = useFamilySlots();
  const { slot, folder: folderId } = Route.useSearch();
  const navigate = useNavigate();

  const cacheKey = user ? `folders:${user.id}` : null;
  type CachedState = { cats: Cat[]; allFolders: FolderRow[]; allDocs: Doc[] };
  const initial = cacheKey ? readNavCache<CachedState>(cacheKey) : undefined;

  const [cats, setCats] = useState<Cat[]>(initial?.cats ?? []);
  const [allFolders, setAllFolders] = useState<FolderRow[]>(initial?.allFolders ?? []);
  const [allDocs, setAllDocs] = useState<Doc[]>(initial?.allDocs ?? []);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveDoc, setMoveDoc] = useState<Doc | null>(null);
  const [moveSlot, setMoveSlot] = useState<FamilySlot>("");
  const [moveFolder, setMoveFolder] = useState<string>("");
  const [renameDoc, setRenameDoc] = useState<Doc | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameFolder, setRenameFolder] = useState<FolderRow | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState("");

  const load = async () => {
    if (!user || !cacheKey) return;
    const [c, f, d] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("folders").select("id, family_slot, parent_id, name, created_by").order("name"),
      supabase
        .from("documents")
        .select("id,title,storage_path,size_bytes,is_favorite,created_at,expiry_date,category_id,ai_summary,mime_type,owner_id,family_slot,folder_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);
    const next: CachedState = {
      cats: (c.data ?? []) as Cat[],
      allFolders: (f.data ?? []) as FolderRow[],
      allDocs: (d.data ?? []) as Doc[],
    };
    setCats(next.cats);
    setAllFolders(next.allFolders);
    setAllDocs(next.allDocs);
    writeNavCache(cacheKey, next);
  };

  // Hydrate instantly from cache, but ALWAYS revalidate in the background on
  // mount / navigation so a folder never renders stale-empty until a manual
  // pull-to-refresh. Also revalidate when the tab regains focus.
  useEffect(() => {
    if (!user || !cacheKey) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, slot, folderId]);

  useEffect(() => {
    if (!user || !cacheKey) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);


  const refresh = async () => {
    if (cacheKey) invalidateNavCache(cacheKey);
    await load();
  };

  // Top-level: counts per slot
  const slotCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of allDocs) m[d.family_slot] = (m[d.family_slot] ?? 0) + 1;
    return m;
  }, [allDocs]);

  const currentFolder = folderId ? allFolders.find((f) => f.id === folderId) ?? null : null;
  const activeSlot: FamilySlot | null = currentFolder?.family_slot ?? slot ?? null;

  // Breadcrumbs (for current folder)
  const crumbs: FolderRow[] = useMemo(() => {
    const list: FolderRow[] = [];
    let cur = currentFolder;
    while (cur) {
      list.unshift(cur);
      cur = cur.parent_id ? allFolders.find((f) => f.id === cur!.parent_id) ?? null : null;
    }
    return list;
  }, [currentFolder, allFolders]);

  const childFolders = useMemo(() => {
    if (!activeSlot) return [];
    return allFolders.filter((f) => f.family_slot === activeSlot && f.parent_id === (currentFolder?.id ?? null));
  }, [allFolders, activeSlot, currentFolder]);

  const docs = useMemo(() => {
    if (!activeSlot) return [];
    return allDocs.filter((d) => d.family_slot === activeSlot && d.folder_id === (currentFolder?.id ?? null));
  }, [allDocs, activeSlot, currentFolder]);

  const open = async (p: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(p, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  const remove = async (d: Doc) => {
    if (!confirm(`Move "${d.title}" to Trash?`)) return;
    await supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", d.id);
    toast.success("Moved to Trash");
    load();
  };
  const toggleFav = async (d: Doc) => {
    await supabase.from("documents").update({ is_favorite: !d.is_favorite }).eq("id", d.id);
    load();
  };

  const createFolder = async () => {
    if (!user || !activeSlot || !newFolderName.trim()) return;
    const { error } = await supabase.from("folders").insert({
      family_slot: activeSlot,
      parent_id: currentFolder?.id ?? null,
      name: newFolderName.trim(),
      created_by: user.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Folder created");
    setNewFolderName("");
    setNewFolderOpen(false);
    load();
  };

  const deleteFolder = async (f: FolderRow) => {
    if (!confirm(`Delete folder "${f.name}"? Files inside move to the parent.`)) return;
    // First move docs inside this folder up one level
    await supabase.from("documents").update({ folder_id: f.parent_id }).eq("folder_id", f.id);
    // Move subfolders up too
    await supabase.from("folders").update({ parent_id: f.parent_id }).eq("parent_id", f.id);
    const { error } = await supabase.from("folders").delete().eq("id", f.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Folder deleted");
    load();
  };

  const openMove = (d: Doc) => {
    setMoveDoc(d);
    setMoveSlot(d.family_slot);
    setMoveFolder(d.folder_id ?? "");
  };
  const confirmMove = async () => {
    if (!moveDoc) return;
    const { error } = await supabase
      .from("documents")
      .update({ family_slot: moveSlot, folder_id: moveFolder || null })
      .eq("id", moveDoc.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Moved");
    setMoveDoc(null);
    load();
  };

  const openRename = (d: Doc) => {
    setRenameDoc(d);
    setRenameValue(d.title);
  };
  const confirmRename = async () => {
    if (!renameDoc || !renameValue.trim()) return;
    const { error } = await supabase
      .from("documents")
      .update({ title: renameValue.trim() })
      .eq("id", renameDoc.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Renamed");
    setRenameDoc(null);
    load();
  };

  const openRenameFolder = (f: FolderRow) => {
    setRenameFolder(f);
    setRenameFolderValue(f.name);
  };
  const confirmRenameFolder = async () => {
    if (!renameFolder || !renameFolderValue.trim()) return;
    const { error } = await supabase
      .from("folders")
      .update({ name: renameFolderValue.trim() })
      .eq("id", renameFolder.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Renamed");
    setRenameFolder(null);
    load();
  };

  if (!user) return null;

  const moveTargetFolders = allFolders.filter((f) => f.family_slot === moveSlot && !f.parent_id);

  return (
    <AppShell onUpload={() => setUploadOpen(true)}>
      {!activeSlot ? (
        <>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight md:text-3xl">Family</h1>
          <p className="mb-6 text-sm text-muted-foreground">Everyone can browse and move files across folders.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slots.length === 0 ? (
              <Card className="p-5 text-sm text-muted-foreground">
                No family members yet. An admin can add them on the Family page.
              </Card>
            ) : null}
            {slots.map((s) => (
              <button key={s.slot} onClick={() => navigate({ to: "/folders", search: { slot: s.slot, folder: undefined } })} className="text-left">
                <Card className="group flex h-full flex-col gap-2 p-5 transition hover:shadow-card hover:-translate-y-0.5">
                  <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary-soft text-primary">
                    <SlotIcon slot={s} className="h-6 w-6" />
                  </div>
                  <div className="text-lg font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{slotCounts[s.slot] ?? 0} files</div>
                </Card>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => navigate({ to: "/folders", search: { slot: undefined, folder: undefined } })} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" /> Family
            </button>
            <span className="text-muted-foreground">/</span>
            <button onClick={() => navigate({ to: "/folders", search: { slot: activeSlot, folder: undefined } })} className="font-medium hover:underline">
              {slotName(activeSlot)}
            </button>
            {crumbs.map((c) => (
              <span key={c.id} className="flex items-center gap-2">
                <span className="text-muted-foreground">/</span>
                <button onClick={() => navigate({ to: "/folders", search: { slot: activeSlot, folder: c.id } })} className="font-medium hover:underline">
                  {c.name}
                </button>
              </span>
            ))}
          </div>

          <div className="mb-5 flex items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {currentFolder?.name ?? slotName(activeSlot)}
            </h1>
            <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)} className="gap-2">
              <FolderPlus className="h-4 w-4" /> New folder
            </Button>
          </div>

          {childFolders.length > 0 && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {childFolders.map((f) => (
                <ContextMenu key={f.id}>
                  <ContextMenuTrigger asChild>
                    <Card className="group flex items-center gap-3 p-3 transition hover:shadow-card">
                      <button onClick={() => navigate({ to: "/folders", search: { slot: activeSlot, folder: f.id } })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                          <Folder className="h-4 w-4" />
                        </div>
                        <div className="truncate text-sm font-medium">{f.name}</div>
                      </button>
                      <Button variant="ghost" size="icon" onClick={() => deleteFolder(f)} aria-label="Delete folder">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Card>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => openRenameFolder(f)}><Pencil className="mr-2 h-4 w-4" /> Rename</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => deleteFolder(f)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          )}

          {docs.length === 0 && childFolders.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">This folder is empty. Upload a file or create a subfolder.</Card>
          ) : docs.length > 0 ? (
            <Card className="divide-y divide-border">
              {docs.map((d) => {
                const n = daysUntil(d.expiry_date);
                return (
                  <ContextMenu key={d.id}>
                    <ContextMenuTrigger asChild>
                      <div className="p-3 sm:flex sm:items-center sm:gap-3">
                        <div className="flex items-center gap-3">
                          <FileThumb storagePath={d.storage_path} mimeType={d.mime_type} />
                          <button onClick={() => setPreview(d)} className="min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium hover:underline">{d.title}</span>
                              {n !== null && n <= 30 && (
                                <Badge variant={n < 0 || n <= 7 ? "destructive" : "secondary"} className="shrink-0">
                                  {n < 0 ? "expired" : n === 0 ? "today" : `${n}d`}
                                </Badge>
                              )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{d.ai_summary ?? formatDate(d.created_at)} · {formatBytes(d.size_bytes)}</div>
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-1 sm:mt-0 sm:gap-0 sm:ml-auto">
                          <Button variant="ghost" size="icon" onClick={() => toggleFav(d)} aria-label="Favorite"><Star className={cn("h-4 w-4", d.is_favorite && "fill-warning text-warning")} /></Button>
                          <Button variant="ghost" size="icon" onClick={() => openMove(d)} aria-label="Move"><Move className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => open(d.storage_path)} aria-label="Download"><Download className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(d)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => openRename(d)}><Pencil className="mr-2 h-4 w-4" /> Rename</ContextMenuItem>
                      <ContextMenuItem onClick={() => openMove(d)}><Move className="mr-2 h-4 w-4" /> Move</ContextMenuItem>
                      <ContextMenuItem onClick={() => open(d.storage_path)}><Download className="mr-2 h-4 w-4" /> Download</ContextMenuItem>
                      <ContextMenuItem onClick={() => toggleFav(d)}><Star className="mr-2 h-4 w-4" /> {d.is_favorite ? "Unfavorite" : "Favorite"}</ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => remove(d)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </Card>
          ) : null}
        </>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        categories={cats}
        ownerId={user.id}
        defaultSlot={activeSlot ?? undefined}
        defaultFolderId={currentFolder?.id ?? null}
        onUploaded={load}
      />

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

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder in {currentFolder?.name ?? (activeSlot ? slotName(activeSlot) : "")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="fname">Folder name</Label>
            <Input id="fname" autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="e.g. Vehicle" onKeyDown={(e) => e.key === "Enter" && createFolder()} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button onClick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveDoc} onOpenChange={(v) => !v && setMoveDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move "{moveDoc?.title}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Family folder</Label>
              <Select value={moveSlot} onValueChange={(v) => { setMoveSlot(v as FamilySlot); setMoveFolder(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {slots.map((s) => (
                    <SelectItem key={s.slot} value={s.slot}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subfolder</Label>
              <Select value={moveFolder || "__root__"} onValueChange={(v) => setMoveFolder(v === "__root__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">— Top level —</SelectItem>
                  {moveTargetFolders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveDoc(null)}>Cancel</Button>
            <Button onClick={confirmMove}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameDoc} onOpenChange={(v) => !v && setRenameDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rname">Name</Label>
            <Input id="rname" autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmRename()} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameDoc(null)}>Cancel</Button>
            <Button onClick={confirmRename} disabled={!renameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameFolder} onOpenChange={(v) => !v && setRenameFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rfname">Name</Label>
            <Input id="rfname" autoFocus value={renameFolderValue} onChange={(e) => setRenameFolderValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmRenameFolder()} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameFolder(null)}>Cancel</Button>
            <Button onClick={confirmRenameFolder} disabled={!renameFolderValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
