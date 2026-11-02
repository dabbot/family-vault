import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Link as LinkIcon, History, BellOff, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ShareDialog } from "@/components/share-dialog";
import { VersionsDialog } from "@/components/versions-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { renderPdfPages } from "@/lib/pdf-preview";
import { resolveMimeType } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  storagePath: string | null;
  mimeType?: string | null;
  documentId?: string | null;
  ownerId?: string | null;
  sizeBytes?: number | null;
  updatedAt?: string | null;
  onChanged?: () => void;
};

export function FilePreviewDialog({
  open,
  onOpenChange,
  title,
  storagePath,
  mimeType,
  documentId,
  ownerId,
  sizeBytes,
  updatedAt,
  onChanged,
}: Props) {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null);
  const [pdfPages, setPdfPages] = useState<string[] | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const isOwner = !!user && !!ownerId && user.id === ownerId;

  useEffect(() => {
    if (!open || !documentId) { setIsPrivate(null); return; }
    supabase.from("documents").select("is_private").eq("id", documentId).maybeSingle().then(({ data }) => {
      setIsPrivate((data?.is_private as boolean | undefined) ?? false);
    });
  }, [open, documentId]);

  useEffect(() => {
    let active = true;
    if (!open || !storagePath) { setUrl(null); return; }
    setLoading(true);
    supabase.storage.from("documents").createSignedUrl(storagePath, 300).then(({ data }) => {
      if (!active) return;
      setUrl(data?.signedUrl ?? null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [open, storagePath]);

  const effectiveMime = resolveMimeType(mimeType, title, storagePath);
  const isImage = (effectiveMime ?? "").startsWith("image/");
  const isPdf = effectiveMime === "application/pdf";
  const canManage = !!documentId && !!ownerId;

  useEffect(() => {
    let active = true;
    setPdfPages(null);
    if (!open || !url || !isPdf) return;
    setPdfLoading(true);
    renderPdfPages(url, 8, 1000).then((pages) => {
      if (!active) return;
      setPdfPages(pages);
      setPdfLoading(false);
    });
    return () => { active = false; };
  }, [open, url, isPdf]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-4 py-3 pr-12 sm:px-5">
          <DialogTitle className="truncate pr-2 text-base">{title}</DialogTitle>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {isOwner && isPrivate !== null && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={isPrivate ? "Make visible to family" : "Make private"}
                title={isPrivate ? "Private — only you can see this. Click to share with family." : "Visible to your family. Click to make private."}
                onClick={async () => {
                  const next = !isPrivate;
                  await supabase.from("documents").update({ is_private: next }).eq("id", documentId!);
                  setIsPrivate(next);
                  toast.success(next ? "Marked private" : "Shared with family");
                  onChanged?.();
                }}
              >
                {isPrivate ? <Lock className="h-4 w-4 text-warning-foreground" /> : <Unlock className="h-4 w-4" />}
              </Button>
            )}
            {canManage && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Snooze reminders">
                      <BellOff className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" align="end">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Snooze reminders</div>
                    {[
                      { label: "7 days", days: 7 },
                      { label: "30 days", days: 30 },
                      { label: "90 days", days: 90 },
                      { label: "Clear snooze", days: 0 },
                    ].map((o) => (
                      <Button
                        key={o.label}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={async () => {
                          const until = o.days === 0 ? null : new Date(Date.now() + o.days * 86400000).toISOString().slice(0, 10);
                          await supabase.from("documents").update({ snoozed_until: until }).eq("id", documentId!);
                          toast.success(o.days === 0 ? "Snooze cleared" : `Snoozed for ${o.label}`);
                          onChanged?.();
                        }}
                      >
                        {o.label}
                      </Button>
                    ))}
                  </PopoverContent>
                </Popover>
                <Button variant="ghost" size="icon" onClick={() => setShareOpen(true)} aria-label="Share">
                  <LinkIcon className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setVersionsOpen(true)} aria-label="Versions">
                  <History className="h-4 w-4" />
                </Button>
              </>
            )}
            {url && (
              <>
                <Button variant="ghost" size="icon" asChild>
                  <a href={url} target="_blank" rel="noreferrer" aria-label="Open in new tab">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="sm" className="ml-auto gap-2" asChild>
                  <a href={url} download={title} aria-label="Download">
                    <Download className="h-4 w-4" /> Download
                  </a>
                </Button>
              </>
            )}
          </div>
        </DialogHeader>
        <div className="h-[70vh] w-full overflow-auto bg-muted/30">
          {loading && <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading…</div>}
          {!loading && url && isImage && (
            <div className="grid h-full place-items-center p-4">
              <img src={url} alt={title} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {!loading && url && isPdf && (
            <>
              {pdfLoading && !pdfPages && (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">Rendering preview…</div>
              )}
              {pdfPages && pdfPages.length > 0 && (
                <div className="flex flex-col items-center gap-3 p-3">
                  {pdfPages.map((p, i) => (
                    <img
                      key={i}
                      src={p}
                      alt={`${title} — page ${i + 1}`}
                      className="w-full max-w-3xl rounded-md border border-border bg-background shadow-sm"
                    />
                  ))}
                  <div className="py-2">
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <a href={url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" /> Open full PDF
                      </a>
                    </Button>
                  </div>
                </div>
              )}
              {pdfPages && pdfPages.length === 0 && (
                <div className="grid h-full place-items-center p-6 text-center">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Couldn’t render a preview for this PDF.</p>
                    <Button asChild className="gap-2">
                      <a href={url} download={title}>
                        <Download className="h-4 w-4" /> Download
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
          {!loading && url && !isImage && !isPdf && (
            <div className="grid h-full place-items-center p-6 text-center">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No inline preview for this file type.</p>
                <Button asChild className="gap-2">
                  <a href={url} download={title}>
                    <Download className="h-4 w-4" /> Download
                  </a>
                </Button>
              </div>
            </div>
          )}
          {!loading && !url && (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">Preview unavailable</div>
          )}
        </div>

      </DialogContent>

      {canManage && (
        <>
          <ShareDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            documentId={documentId ?? null}
            ownerId={ownerId ?? null}
            title={title}
          />
          <VersionsDialog
            open={versionsOpen}
            onOpenChange={setVersionsOpen}
            documentId={documentId ?? null}
            ownerId={ownerId ?? null}
            title={title}
            currentStoragePath={storagePath}
            currentMime={mimeType ?? null}
            currentSize={sizeBytes ?? null}
            currentUpdatedAt={updatedAt ?? null}
            onChanged={onChanged}
          />
        </>
      )}
    </Dialog>
  );
}
