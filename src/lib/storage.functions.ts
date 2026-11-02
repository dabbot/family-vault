import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { from: (t: string) => any }; userId: string };

async function assertAdmin(context: Ctx) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
  if (!data?.length) throw new Error("Only an admin can manage the family's storage.");
}

const Provider = z.enum(["dropbox", "google_drive"]);

/** What is linked, and which providers this server is set up for. */
export const getStorageStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { PROVIDERS, connectionStatus } = await import("./storage/connection.server");
    return {
      connection: await connectionStatus(),
      providers: Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, configured: p.configured() })),
      encryptionReady: !!process.env.TOKEN_ENCRYPTION_KEY?.trim(),
    };
  });

/** Starts linking Dropbox or Google Drive: returns the provider's sign-in page to open. */
export const startStorageConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: Provider }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    if (!process.env.TOKEN_ENCRYPTION_KEY?.trim()) throw new Error("Set TOKEN_ENCRYPTION_KEY on the server before linking storage.");
    const { providerById, signState, appUrl, redirectUri } = await import("./storage/connection.server");
    const provider = providerById(data.provider);
    if (!provider.configured()) throw new Error(`${provider.label} is not set up on this server yet. See the README.`);
    const base = appUrl(getRequest());
    return { url: provider.authUrl(redirectUri(provider.id, base), signState(context.userId, provider.id)) };
  });

export const disconnectStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { disconnect } = await import("./storage/connection.server");
    await disconnect();
    return { ok: true };
  });

export const syncStorageNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { syncStorage } = await import("./storage/sync.server");
    return syncStorage();
  });

export const reconcileStorageFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { reconcileFolders } = await import("./storage/sync.server");
    return reconcileFolders();
  });

/** Copies a newly uploaded document to the linked storage. Any family member can call it for a document they can see. */
export const pushDocumentToStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // The caller's own client enforces row-level security: they must be able to see the document.
    const { data: visible } = await (context as Ctx).supabase.from("documents").select("id").eq("id", data.documentId).maybeSingle();
    if (!visible) throw new Error("Document not found.");
    const { pushDocument } = await import("./storage/sync.server");
    return pushDocument(data.documentId);
  });

/** Copies every document that is not yet in cloud storage. */
export const pushAllToStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pushDocument } = await import("./storage/sync.server");
    const { data: docs } = await supabaseAdmin.from("documents").select("id, title").is("remote_file_id", null).is("deleted_at", null).limit(500);
    let pushed = 0;
    const errors: { title: string; reason: string }[] = [];
    for (const d of docs ?? []) {
      try {
        const r = await pushDocument(d.id);
        if (r.pushed) pushed++;
      } catch (e) {
        errors.push({ title: d.title, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    return { pushed, total: docs?.length ?? 0, errors };
  });
