import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Cloud, Loader2, Plus, RefreshCw, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { SlotIcon } from "@/components/slot-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SLOTS_QUERY_KEY, slugify, useFamilySlots, type Slot } from "@/lib/family-slots";
import {
  disconnectStorage,
  getStorageStatus,
  pushAllToStorage,
  reconcileStorageFolders,
  startStorageConnect,
  syncStorageNow,
} from "@/lib/storage.functions";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({ meta: [{ title: "Setup — Family Vault" }] }),
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { storage?: string; reason?: string } => ({
    storage: typeof s.storage === "string" ? s.storage : undefined,
    reason: typeof s.reason === "string" ? s.reason : undefined,
  }),
  component: SetupPage,
});

function SetupPage() {
  const router = useRouter();
  const { isAdmin, loading, user } = useAuth();
  const search = Route.useSearch();

  useEffect(() => {
    if (!loading && !isAdmin) void router.navigate({ to: "/home", replace: true });
  }, [isAdmin, loading, router]);

  useEffect(() => {
    if (search.storage === "connected") toast.success("Storage linked. Run “Sync now” to import what is already there.");
    if (search.storage === "error") toast.error(search.reason ?? "Could not link storage.", { duration: 10000 });
  }, [search.storage, search.reason]);

  if (loading || !isAdmin) return null;

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight md:text-3xl">Setup</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Add the people in your family and any shared folders, then link your Dropbox or Google Drive.
      </p>
      <MembersSection ownEmail={user?.email ?? ""} />
      <StorageSection />
    </AppShell>
  );
}

/* --------------------------------------------------------------- members */

function MembersSection({ ownEmail }: { ownEmail: string }) {
  const qc = useQueryClient();
  const { slots, people, shared, isLoading } = useFamilySlots();
  const [person, setPerson] = useState({ name: "", email: "" });
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: SLOTS_QUERY_KEY });

  const uniqueSlug = (name: string) => {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; slots.some((s) => s.slot === slug); i++) slug = `${base}-${i}`;
    return slug;
  };

  const add = async (row: { name: string; kind: "person" | "shared"; email: string | null }) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("family_members").insert({
        slug: uniqueSlug(row.name),
        name: row.name.trim(),
        kind: row.kind,
        email: row.email ? row.email.trim().toLowerCase() : null,
        sort_order: row.kind === "person" ? 10 + people.length : 100 + shared.length,
      });
      if (error) throw error;
      await refresh();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes("family_members_email_key") ? "That email is already in the family." : msg);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rename = async (s: Slot, name: string, email: string | null) => {
    const { error } = await supabase
      .from("family_members")
      .update({ name: name.trim(), ...(s.kind === "person" ? { email: (email ?? "").trim().toLowerCase() } : {}) })
      .eq("slug", s.slot);
    if (error) toast.error(error.message);
    else await refresh();
  };

  const remove = async (s: Slot) => {
    if (!window.confirm(`Remove ${s.name}? This is only possible when no documents are filed under them.`)) return;
    const { error } = await supabase.from("family_members").delete().eq("slug", s.slot);
    if (error) {
      toast.error(
        error.message.includes("foreign key")
          ? `${s.name} still has documents. Move or delete them first.`
          : error.message,
      );
    } else await refresh();
  };

  const noSelf = !people.some((p) => p.email === ownEmail.toLowerCase());

  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-semibold">Family</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Each person gets their own folder and can sign in with the email you add here. Shared folders hold
        family-wide documents such as car or health insurance.
      </p>

      {noSelf && !isLoading ? (
        <Card className="mb-3 flex flex-wrap items-center justify-between gap-3 border-primary/40 bg-primary-soft p-3 text-sm">
          <span>Add yourself first so your own documents have a home.</span>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void add({ name: ownEmail.split("@")[0] ?? "Me", kind: "person", email: ownEmail })}
          >
            Add me ({ownEmail})
          </Button>
        </Card>
      ) : null}

      <Card className="divide-y divide-border">
        {isLoading ? <div className="p-3 text-sm text-muted-foreground">Loading…</div> : null}
        {!isLoading && slots.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Nobody yet. Add people and shared folders below.</div>
        ) : null}
        {slots.map((s) => (
          <MemberRow key={s.slot} slot={s} onSave={rename} onRemove={remove} />
        ))}
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div className="font-medium">Add a person</div>
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="e.g. Alex" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-email">Email they sign in with</Label>
            <Input
              id="p-email"
              type="email"
              value={person.email}
              onChange={(e) => setPerson({ ...person, email: e.target.value })}
              placeholder="alex@example.com"
            />
          </div>
          <Button
            size="sm"
            disabled={busy || !person.name.trim() || !/^\S+@\S+\.\S+$/.test(person.email)}
            onClick={async () => {
              if (await add({ name: person.name, kind: "person", email: person.email })) setPerson({ name: "", email: "" });
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add person
          </Button>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="font-medium">Add a shared folder</div>
          <div className="space-y-1.5">
            <Label htmlFor="f-name">Folder name</Label>
            <Input id="f-name" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. Car Insurance" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Car Insurance", "Health Insurance", "Life Insurance", "Home"].map((n) =>
              shared.some((s) => s.name === n) ? null : (
                <button key={n} type="button" onClick={() => setFolder(n)} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                  {n}
                </button>
              ),
            )}
          </div>
          <Button
            size="sm"
            disabled={busy || !folder.trim()}
            onClick={async () => {
              if (await add({ name: folder, kind: "shared", email: null })) setFolder("");
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add folder
          </Button>
        </Card>
      </div>
    </section>
  );
}

function MemberRow({
  slot,
  onSave,
  onRemove,
}: {
  slot: Slot;
  onSave: (s: Slot, name: string, email: string | null) => Promise<void>;
  onRemove: (s: Slot) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(slot.name);
  const [email, setEmail] = useState(slot.email ?? "");
  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary">
        <SlotIcon slot={slot} className="h-4 w-4" />
      </div>
      {editing ? (
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <Input className="h-8 w-40" value={name} onChange={(e) => setName(e.target.value)} />
          {slot.kind === "person" ? <Input className="h-8 w-56" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /> : null}
          <Button
            size="sm"
            onClick={async () => {
              await onSave(slot, name, email);
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="font-medium">{slot.name}</div>
          <div className="truncate text-xs text-muted-foreground">{slot.kind === "person" ? slot.email : "Shared folder"}</div>
        </div>
      )}
      {!editing ? (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="icon" variant="ghost" aria-label={`Remove ${slot.name}`} onClick={() => void onRemove(slot)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- storage */

function StorageSection() {
  const status = useServerFn(getStorageStatus);
  const connect = useServerFn(startStorageConnect);
  const unlink = useServerFn(disconnectStorage);
  const sync = useServerFn(syncStorageNow);
  const pushAll = useServerFn(pushAllToStorage);
  const reconcile = useServerFn(reconcileStorageFolders);
  const q = useQuery({ queryKey: ["storage-status"], queryFn: () => status() });
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ path?: string; reason?: string }[]>([]);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      toast.success(await fn());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong", { duration: 10000 });
    } finally {
      setBusy(null);
      void q.refetch();
    }
  };

  const conn = q.data?.connection;
  const label = (id?: string | null) => q.data?.providers.find((p) => p.id === id)?.label ?? id ?? "";

  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-semibold">Cloud storage</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Link the family&rsquo;s Dropbox or Google Drive. Files you upload here are copied there, and files you add there
        (inside a family member&rsquo;s folder) are imported here.
      </p>

      {q.isLoading ? <Card className="p-4 text-sm text-muted-foreground">Loading…</Card> : null}

      {q.data && !q.data.encryptionReady ? (
        <Card className="mb-3 border-destructive/40 p-4 text-sm">
          The server needs a <code>TOKEN_ENCRYPTION_KEY</code> before storage can be linked. Generate one with{" "}
          <code>openssl rand -base64 32</code> and add it to the server settings.
        </Card>
      ) : null}

      {q.data && !conn ? (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.providers.map((p) => (
            <Card key={p.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2 font-medium">
                <Cloud className="h-5 w-5 text-primary" /> {p.label}
              </div>
              <p className="text-sm text-muted-foreground">
                {p.id === "dropbox"
                  ? "Files live in an app folder inside your Dropbox, with one folder per family member."
                  : "Files live in a “Family Vault” folder in your Google Drive, with one folder per family member."}
              </p>
              {p.configured ? (
                <Button
                  size="sm"
                  disabled={!!busy || !q.data?.encryptionReady}
                  onClick={async () => {
                    setBusy(p.id);
                    try {
                      const { url } = await connect({ data: { provider: p.id } });
                      window.location.href = url;
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not start linking");
                      setBusy(null);
                    }
                  }}
                >
                  {busy === p.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Connect {p.label}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Not set up on this server yet. The README explains how to create the {p.label} app keys.
                </p>
              )}
            </Card>
          ))}
        </div>
      ) : null}

      {conn ? (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-medium">
                <Cloud className="h-5 w-5 text-primary" /> {label(conn.provider)}
                <Badge variant="secondary">Linked</Badge>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {conn.account_label} · last synced{" "}
                {conn.last_synced_at ? `${formatDate(conn.last_synced_at)} ${new Date(conn.last_synced_at).toLocaleTimeString()}` : "never"}
              </div>
              {conn.last_error ? <div className="mt-1 text-sm text-destructive">{conn.last_error}</div> : null}
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={() =>
                window.confirm("Unlink storage? Files already imported stay in the vault.") &&
                void run("unlink", async () => {
                  await unlink();
                  return "Storage unlinked.";
                })
              }
            >
              <Unplug className="mr-1.5 h-4 w-4" /> Unlink
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                void run("sync", async () => {
                  const r = await sync();
                  setErrors(r.errors);
                  return `Imported ${r.imported}, skipped ${r.skipped}${r.errors.length ? `, ${r.errors.length} need attention` : ""}.`;
                })
              }
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} /> Sync now
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                void run("push", async () => {
                  const r = await pushAll();
                  return `Copied ${r.pushed} of ${r.total} files to ${label(conn.provider)}${r.errors.length ? `; ${r.errors.length} failed` : ""}.`;
                })
              }
            >
              Copy existing files to {label(conn.provider)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                void run("reconcile", async () => {
                  const r = await reconcile();
                  return `Folders: ${r.updated} updated, ${r.unchanged} unchanged.`;
                })
              }
            >
              Re-match folders
            </Button>
          </div>
          {errors.length ? (
            <ul className="max-h-40 space-y-1 overflow-auto rounded border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {errors.slice(0, 20).map((e, i) => (
                <li key={i}>
                  <span className="font-mono text-foreground">{e.path ?? "?"}</span> — {e.reason ?? "unknown"}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}
