import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, Camera, FileText, Loader2, ScanLine } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { extractDocumentMetadata } from "@/lib/documents.functions";
import { pushDocumentToStorage } from "@/lib/storage.functions";
import { ScannerDialog } from "@/components/scanner-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useFamilySlots, type FamilySlot } from "@/lib/family-slots";

type Category = { id: string; name: string; slug: string };
type Folder = { id: string; name: string; family_slot: FamilySlot; parent_id: string | null };

export function UploadDialog({
  open,
  onOpenChange,
  categories,
  ownerId,
  defaultSlot,
  defaultFolderId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: Category[];
  ownerId: string;
  defaultSlot?: FamilySlot;
  defaultFolderId?: string | null;
  onUploaded: () => void;
}) {
  const { user } = useAuth();
  const { slots, slotForEmail } = useFamilySlots();
  const ownSlot = slotForEmail(user?.email) ?? "";
  const mySlot = defaultSlot ?? ownSlot;
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [slot, setSlot] = useState<FamilySlot>(mySlot);
  const [folderId, setFolderId] = useState<string>(defaultFolderId ?? "");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const extract = useServerFn(extractDocumentMetadata);
  const pushToStorage = useServerFn(pushDocumentToStorage);

  useEffect(() => {
    if (!open) return;
    setSlot(defaultSlot ?? slotForEmail(user?.email) ?? "");
    setFolderId(defaultFolderId ?? "");
  }, [open, defaultSlot, defaultFolderId, user?.email, slotForEmail]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("folders")
      .select("id, name, family_slot, parent_id")
      .eq("family_slot", slot)
      .order("name")
      .then(({ data }) => setFolders((data ?? []) as Folder[]));
  }, [open, slot]);

  const pick = (f: File | null) => {
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setProgress(10);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const docId = crypto.randomUUID();
      // Storage path always uses uploader's id so storage RLS allows the write.
      const path = `${ownerId}/${docId}.${ext}`;

      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      setProgress(55);

      const { error: insErr } = await supabase.from("documents").insert({
        id: docId,
        owner_id: ownerId,
        family_slot: slot,
        folder_id: folderId || null,
        category_id: categoryId || null,
        title: title || file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        source: "web",
      });
      if (insErr) throw insErr;
      setProgress(70);

      extract({ data: { documentId: docId } })
        .then(() => onUploaded())
        .catch((e) => console.warn("AI extraction failed", e));

      // Copy to the family's Dropbox or Google Drive when one is linked; never blocks the upload.
      pushToStorage({ data: { documentId: docId } })
        .catch((e) => console.warn("Cloud copy failed", e));

      setProgress(100);
      toast.success("Uploaded. AI is reading it in the background.");
      onUploaded();
      onOpenChange(false);
      setFile(null);
      setTitle("");
      setCategoryId("");
      setProgress(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const topFolders = folders.filter((f) => !f.parent_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
        </DialogHeader>

        {!file ? (
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-5 sm:p-8 text-center hover:bg-muted/50"
            >
              <Upload className="h-8 w-8 text-primary" />
              <div className="font-medium">Choose a file</div>
              <div className="text-xs text-muted-foreground">PDF, images, or any document</div>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="flex items-center justify-center gap-2 rounded-xl border border-border p-4 text-sm hover:bg-muted/50"
              >
                <ScanLine className="h-4 w-4" /> Scan document
              </button>
              <button
                type="button"
                onClick={() => cameraInput.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border border-border p-4 text-sm hover:bg-muted/50"
              >
                <Camera className="h-4 w-4" /> Take a photo
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              hidden
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <FileText className="h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Change</Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Family folder</Label>
              <Select value={slot} onValueChange={(v) => { setSlot(v as FamilySlot); setFolderId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {slots.map((s) => (
                    <SelectItem key={s.slot} value={s.slot}>
                      {s.name}{s.slot === ownSlot ? " (me)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {topFolders.length > 0 && (
              <div className="space-y-1.5">
                <Label>Subfolder (optional)</Label>
                <Select value={folderId || "__root__"} onValueChange={(v) => setFolderId(v === "__root__" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__root__">— Top level —</SelectItem>
                    {topFolders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {categories.length > 0 && (
              <div className="space-y-1.5">
                <Label>Tag (optional)</Label>
                <Select value={categoryId || "__none__"} onValueChange={(v) => setCategoryId(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No tag" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— No tag —</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {busy && <Progress value={progress} />}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!file || busy}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <ScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScanned={(f, suggested) => { pick(f); setTitle(suggested); }}
      />
    </Dialog>
  );
}
