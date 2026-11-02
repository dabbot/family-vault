import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Pencil, Trash2, Plus, StickyNote } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({ meta: [{ title: "Notes — Family Vault" }] }),
  component: NotesPage,
});

type Note = { id: string; author_id: string; title: string | null; body: string; created_at: string; updated_at: string };
type AuthorMap = Record<string, { name: string; email: string | null }>;

function NotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [authors, setAuthors] = useState<AuthorMap>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("family_notes")
      .select("id, author_id, title, body, created_at, updated_at")
      .order("updated_at", { ascending: false });
    const rows = (data ?? []) as Note[];
    setNotes(rows);

    const ids = Array.from(new Set(rows.map((n) => n.author_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const m: AuthorMap = {};
      ((profs ?? []) as { id: string; full_name: string | null }[]).forEach((p) => {
        m[p.id] = { name: p.full_name ?? "Family member", email: null };
      });
      setAuthors(m);
    }
  };

  useEffect(() => { load(); }, [user]);

  const openNew = () => {
    setEditing(null);
    setTitle("");
    setBody("");
    setOpen(true);
  };
  const openEdit = (n: Note) => {
    setEditing(n);
    setTitle(n.title ?? "");
    setBody(n.body);
    setOpen(true);
  };

  const save = async () => {
    if (!user || !body.trim()) return;
    setBusy(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("family_notes")
          .update({ title: title.trim() || null, body: body.trim() })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Note updated");
      } else {
        const { error } = await supabase
          .from("family_notes")
          .insert({ author_id: user.id, title: title.trim() || null, body: body.trim() });
        if (error) throw error;
        toast.success("Note posted");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (n: Note) => {
    if (!confirm("Delete this note?")) return;
    const { error } = await supabase.from("family_notes").delete().eq("id", n.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Notes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Anything you want the family to know.</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> New note</Button>
      </div>

      {notes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
          <StickyNote className="h-8 w-8 text-muted-foreground/60" />
          <div>No notes yet. Be the first to post something for the family.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {notes.map((n) => {
            const a = authors[n.author_id];
            const name = a?.name ?? "Family member";
            const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
            const mine = n.author_id === user.id;
            return (
              <Card key={n.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback>{initials || "?"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{name}{mine ? " (you)" : ""}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(n.updated_at)}</div>
                  </div>
                  {mine && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(n)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(n)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
                {n.title && <div className="font-medium">{n.title}</div>}
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{n.body}</div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit note" : "New note"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nt">Title (optional)</Label>
              <Input id="nt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wifi password changed" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb">Note</Label>
              <Textarea id="nb" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write anything important for the family…" rows={6} maxLength={4000} autoFocus />
              <div className="text-right text-xs text-muted-foreground">{body.length}/4000</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy || !body.trim()}>{editing ? "Save" : "Post"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
