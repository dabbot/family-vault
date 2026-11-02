// Server only. Two-way mirror between the vault and the family's Dropbox or Google Drive.
//
// Inbound: every file inside <vault folder>/<member or shared folder>/... is imported,
// with sub-folders recreated in the app. Outbound: files uploaded in the app are copied
// to the matching member folder.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runExtraction } from "../documents.functions";
import { activeConnection, providerById, recordSync } from "./connection.server";
import type { ConnectionState, RemoteFile } from "./types";

type SlotRow = { slug: string; name: string; email: string | null };
type Owner = { slot: string; name: string; ownerId: string };

export type SyncResult = { imported: number; skipped: number; errors: { path?: string; reason?: string }[] };

async function slotsAndOwners(): Promise<{ bySlot: Map<string, Owner>; byFolder: Map<string, Owner> }> {
  const { data: slots } = await supabaseAdmin.from("family_members").select("slug, name, email");
  const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").limit(1);
  const fallbackOwner = admins?.[0]?.user_id;
  if (!fallbackOwner) throw new Error("No admin user yet. Sign in once before syncing.");

  const emailToUser = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) emailToUser.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }

  const bySlot = new Map<string, Owner>();
  const byFolder = new Map<string, Owner>();
  for (const s of (slots ?? []) as SlotRow[]) {
    const owner = { slot: s.slug, name: s.name, ownerId: (s.email && emailToUser.get(s.email)) || fallbackOwner };
    bySlot.set(s.slug, owner);
    byFolder.set(s.name.trim().toLowerCase(), owner);
    byFolder.set(s.slug, owner);
  }
  return { bySlot, byFolder };
}

/** The cloud folder name for a slot: its display name, made safe for file systems. */
export function folderNameFor(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Unsorted";
}

const safeFilename = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").slice(0, 200) || "file";

async function ensureFolderPath(slot: string, segments: string[], createdBy: string): Promise<string | null> {
  let parentId: string | null = null;
  for (const raw of segments) {
    const name = raw.trim();
    if (!name) continue;
    const base = supabaseAdmin.from("folders").select("id").eq("family_slot", slot).eq("name", name);
    const pid: string | null = parentId;
    const found: { data: unknown } = pid === null ? await base.is("parent_id", null).maybeSingle() : await base.eq("parent_id", pid).maybeSingle();
    const existing = found.data as { id: string } | null;
    if (existing?.id) {
      parentId = existing.id;
      continue;
    }
    const ins: { data: { id: string } | null; error: Error | null } = await supabaseAdmin
      .from("folders")
      .insert({ family_slot: slot, name, parent_id: pid, created_by: createdBy })
      .select("id")
      .single();
    const newId: string | undefined = (ins.data as { id: string } | null)?.id;
    if (ins.error || !newId) throw ins.error ?? new Error("folder insert failed");
    parentId = newId;
  }
  return parentId;
}

async function importFile(
  conn: ConnectionState,
  file: RemoteFile,
  byFolder: Map<string, Owner>,
): Promise<{ status: "imported" | "skipped" | "error"; reason?: string }> {
  const { data: existing } = await supabaseAdmin.from("documents").select("id").eq("remote_file_id", file.id).maybeSingle();
  if (existing) return { status: "skipped", reason: "already imported" };
  if (file.path.length < 2) return { status: "skipped", reason: "Put files inside a family member's folder, not at the top level." };

  const owner = byFolder.get(file.path[0]!.trim().toLowerCase());
  if (!owner) return { status: "skipped", reason: `Folder "${file.path[0]}" does not match any family member or shared folder.` };

  let folderId: string | null = null;
  try {
    folderId = await ensureFolderPath(owner.slot, file.path.slice(1, -1), owner.ownerId);
  } catch (e) {
    console.warn("[storage-sync] folder create failed", file.path.join("/"), e);
  }

  const provider = providerById(conn.provider);
  let downloaded: { bytes: ArrayBuffer; mime: string };
  try {
    downloaded = await provider.download(conn, file);
  } catch (e) {
    return { status: "error", reason: e instanceof Error ? e.message : String(e) };
  }

  const storagePath = `${owner.ownerId}/${conn.provider}/${file.id.replace(/[^a-zA-Z0-9_-]/g, "")}-${safeFilename(file.name)}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("documents")
    .upload(storagePath, downloaded.bytes, { contentType: downloaded.mime, upsert: true });
  if (upErr) return { status: "error", reason: upErr.message };

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("documents")
    .insert({
      owner_id: owner.ownerId,
      member_name: owner.name,
      family_slot: owner.slot,
      title: file.name,
      storage_path: storagePath,
      mime_type: downloaded.mime,
      size_bytes: file.size ?? downloaded.bytes.byteLength,
      source: conn.provider,
      remote_file_id: file.id,
      ai_processed: false,
      folder_id: folderId,
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { status: "error", reason: insErr?.message ?? "insert failed" };

  try {
    await runExtraction(supabaseAdmin, owner.ownerId, inserted.id);
  } catch (e) {
    console.error("[storage-sync] extraction failed", inserted.id, e);
  }
  return { status: "imported" };
}

/** Imports new files from the linked storage. Safe to call repeatedly. */
export async function syncStorage(): Promise<SyncResult> {
  const conn = await activeConnection();
  if (!conn) throw new Error("No Dropbox or Google Drive is linked yet.");
  const result: SyncResult = { imported: 0, skipped: 0, errors: [] };
  try {
    const { byFolder } = await slotsAndOwners();
    const { files, cursor } = await providerById(conn.provider).listChanges(conn);
    for (const file of files) {
      const r = await importFile(conn, file, byFolder);
      if (r.status === "imported") result.imported++;
      else if (r.status === "skipped") {
        result.skipped++;
        if (r.reason && r.reason !== "already imported") result.errors.push({ path: file.path.join("/"), reason: r.reason });
      } else result.errors.push({ path: file.path.join("/"), reason: r.reason });
    }
    await recordSync(cursor, null);
    return result;
  } catch (e) {
    await recordSync(null, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** Re-matches each imported document's folder to where it now sits in the cloud. Does not download files. */
export async function reconcileFolders(): Promise<{ updated: number; unchanged: number; missing: number }> {
  const conn = await activeConnection();
  if (!conn) throw new Error("No Dropbox or Google Drive is linked yet.");
  const { byFolder } = await slotsAndOwners();
  let updated = 0;
  let unchanged = 0;
  let missing = 0;
  for (const file of await providerById(conn.provider).listAll(conn)) {
    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("id, owner_id, family_slot, folder_id")
      .eq("remote_file_id", file.id)
      .maybeSingle();
    if (!doc) {
      missing++;
      continue;
    }
    const owner = byFolder.get((file.path[0] ?? "").trim().toLowerCase());
    const slot = owner?.slot ?? doc.family_slot;
    const folderId = await ensureFolderPath(slot, file.path.slice(1, -1), doc.owner_id);
    if ((doc.folder_id ?? null) === (folderId ?? null) && slot === doc.family_slot) {
      unchanged++;
      continue;
    }
    await supabaseAdmin.from("documents").update({ folder_id: folderId, family_slot: slot }).eq("id", doc.id);
    updated++;
  }
  return { updated, unchanged, missing };
}

/** Copies one document from the vault to the linked storage. Returns false when nothing is linked. */
export async function pushDocument(docId: string): Promise<{ pushed: boolean; reason?: string }> {
  const conn = await activeConnection();
  if (!conn) return { pushed: false, reason: "No storage linked" };
  const { data: doc } = await supabaseAdmin
    .from("documents")
    .select("id, storage_path, family_slot, title, mime_type, remote_file_id")
    .eq("id", docId)
    .single();
  if (!doc) return { pushed: false, reason: "Document not found" };
  if (doc.remote_file_id) return { pushed: false, reason: "Already in cloud storage" };
  const { bySlot } = await slotsAndOwners();
  const owner = bySlot.get(doc.family_slot);
  const dl = await supabaseAdmin.storage.from("documents").download(doc.storage_path);
  if (dl.error || !dl.data) return { pushed: false, reason: dl.error?.message ?? "File missing" };
  const uploaded = await providerById(conn.provider).upload(
    conn,
    folderNameFor(owner?.name ?? doc.family_slot),
    safeFilename(doc.title || "file"),
    await dl.data.arrayBuffer(),
    doc.mime_type ?? "application/octet-stream",
  );
  await supabaseAdmin.from("documents").update({ remote_file_id: uploaded.id }).eq("id", doc.id);
  return { pushed: true };
}
