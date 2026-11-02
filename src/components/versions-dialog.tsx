import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { History, Upload, Download, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBytes, formatDate } from "@/lib/utils";

type Version = {
  id: string;
  version_no: number;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export function VersionsDialog({
  open,
  onOpenChange,
  documentId,
  ownerId,
  title,
  currentStoragePath,
  currentMime,
  currentSize,
  currentUpdatedAt,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string | null;
  ownerId: string | null;
  title: string;
  currentStoragePath: string | null;
  currentMime: string | null;
  currentSize: number | null;
  currentUpdatedAt: string | null;
  onChanged?: () => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!documentId) return;
    const { data } = await supabase
      .from("document_versions")
      .select("id,version_no,storage_path,mime_type,size_bytes,created_at")
      .eq("document_id", documentId)
      .order("version_no", { ascending: false });
    setVersions((data ?? []) as Version[]);
  };

  useEffect(() => { if (open && documentId) load(); }, [open, documentId]);

  const nextVersionNo = () =>
    versions.reduce((m, v) => Math.max(m, v.version_no), 0) + 1;

  // Archive current file as a new version row pointing at the existing storage path.
  const archiveCurrent = async () => {
    if (!documentId || !ownerId || !currentStoragePath) return null;
    const { error } = await supabase.from("document_versions").insert({
      document_id: documentId,
      owner_id: ownerId,
      version_no: nextVersionNo(),
      storage_path: currentStoragePath,
      mime_type: currentMime,
      size_bytes: currentSize,
      created_at: currentUpdatedAt ?? new Date().toISOString(),
    });
    if (error) throw error;
  };

  const uploadNew = async (file: File) => {
    if (!documentId || !ownerId) return;
    setBusy(true);
    try {
      await archiveCurrent();
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${ownerId}/${documentId}.v${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error: dErr } = await supabase
        .from("documents")
        .update({
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);
      if (dErr) throw dErr;
      toast.success("New version uploaded");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const download = async (path: string, filename: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (!data?.signedUrl) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = filename;
    a.click();
  };

  const restore = async (v: Version) => {
    if (!documentId || !ownerId || !currentStoragePath) return;
    if (!confirm(`Restore v${v.version_no} as the current version? The current file will be archived.`)) return;
    setBusy(true);
    try {
      // Archive the current file as a new version row
      await archiveCurrent();
      // Make the chosen version the current one
      const { error: dErr } = await supabase
        .from("documents")
        .update({
          storage_path: v.storage_path,
          mime_type: v.mime_type,
          size_bytes: v.size_bytes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);
      if (dErr) throw dErr;
      // Remove the restored row from the archive list
      await supabase.from("document_versions").delete().eq("id", v.id);
      toast.success(`Restored v${v.version_no}`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Version history — {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-sm">
              <div className="font-medium">Upload a new version</div>
              <div className="text-xs text-muted-foreground">
                Current file will be archived. AI re-extraction does not re-run automatically.
              </div>
            </div>
            <Button onClick={() => fileInput.current?.click()} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              New version
            </Button>
            <input
              ref={fileInput}
              type="file"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadNew(f); }}
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Current
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border bg-primary/5 p-3">
              <div className="text-xs font-mono">v{nextVersionNo() - (versions.length > 0 ? 0 : 0)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{title}</div>
                <div className="text-xs text-muted-foreground">
                  Updated {formatDate(currentUpdatedAt)} · {formatBytes(currentSize)}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Previous versions
            </div>
            {versions.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No previous versions. Upload a new file above to start a history.
              </div>
            ) : (
              <ul className="space-y-2">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 rounded-md border border-border p-3">
                    <div className="text-xs font-mono text-muted-foreground">v{v.version_no}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground">
                        {formatDate(v.created_at)} · {formatBytes(v.size_bytes)}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => download(v.storage_path, `${title}-v${v.version_no}`)} className="gap-1">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => restore(v)} disabled={busy} className="gap-1">
                      <RotateCcw className="h-4 w-4" /> Restore
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
