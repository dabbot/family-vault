import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Link as LinkIcon, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

type Share = {
  id: string;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  created_at: string;
};

const DURATIONS = [
  { label: "1 day", value: "1" },
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "Never expires", value: "0" },
];

export function ShareDialog({
  open,
  onOpenChange,
  documentId,
  ownerId,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string | null;
  ownerId: string | null;
  title: string;
}) {
  const [shares, setShares] = useState<Share[]>([]);
  const [duration, setDuration] = useState("7");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!documentId) return;
    const { data } = await supabase
      .from("document_shares")
      .select("id,token,expires_at,revoked_at,view_count,created_at")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });
    setShares((data ?? []) as Share[]);
  };

  useEffect(() => { if (open && documentId) load(); }, [open, documentId]);

  const create = async () => {
    if (!documentId || !ownerId) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
      const days = parseInt(duration, 10);
      const expires_at = days > 0 ? new Date(Date.now() + days * 86400 * 1000).toISOString() : null;
      const { error } = await supabase
        .from("document_shares")
        .insert({ document_id: documentId, owner_id: ownerId, token, expires_at });
      if (error) throw error;
      toast.success("Share link created");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create link");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this link? It will stop working immediately.")) return;
    await supabase.from("document_shares").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    toast.success("Revoked");
    load();
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4" /> Share “{title}”
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Create a private link to share with someone outside the family. They’ll be able to view and download —
              no sign-in needed.
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Link expires after</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={create} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create link"}
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Existing links
            </div>
            {shares.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No links yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {shares.map((s) => {
                  const expired = !!s.expires_at && new Date(s.expires_at).getTime() < Date.now();
                  const dead = !!s.revoked_at || expired;
                  const status = s.revoked_at ? "Revoked" : expired ? "Expired" : s.expires_at ? `Expires ${formatDate(s.expires_at)}` : "Never expires";
                  return (
                    <li key={s.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                      <div className="min-w-0 flex-1">
                        <div className={`truncate font-mono text-xs ${dead ? "text-muted-foreground line-through" : ""}`}>
                          /share/{s.token}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {status} · {s.view_count} view{s.view_count === 1 ? "" : "s"}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => copyLink(s.token)} disabled={dead} aria-label="Copy link">
                        <Copy className="h-4 w-4" />
                      </Button>
                      {!s.revoked_at && (
                        <Button variant="ghost" size="icon" onClick={() => revoke(s.id)} aria-label="Revoke">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </li>
                  );
                })}
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
