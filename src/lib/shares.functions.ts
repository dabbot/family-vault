import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({ token: z.string().min(8).max(128) });

export const getSharedDocument = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: share, error } = await supabaseAdmin
      .from("document_shares")
      .select("id, document_id, expires_at, revoked_at")
      .eq("token", data.token)
      .maybeSingle();

    if (error) throw new Error("Share lookup failed");
    if (!share) return { ok: false as const, reason: "not_found" as const };
    if (share.revoked_at) return { ok: false as const, reason: "revoked" as const };
    if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }

    const { data: doc, error: dErr } = await supabaseAdmin
      .from("documents")
      .select("id, title, storage_path, mime_type, size_bytes, deleted_at")
      .eq("id", share.document_id)
      .maybeSingle();
    if (dErr || !doc) return { ok: false as const, reason: "not_found" as const };
    if (doc.deleted_at) return { ok: false as const, reason: "not_found" as const };

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 60 * 30);
    if (sErr || !signed?.signedUrl) throw new Error("Could not generate file link");

    // Best-effort view tracking — don't block on failures.
    await supabaseAdmin
      .from("document_shares")
      .update({
        view_count: ((await supabaseAdmin
          .from("document_shares")
          .select("view_count")
          .eq("id", share.id)
          .maybeSingle()).data?.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("id", share.id);

    return {
      ok: true as const,
      title: doc.title,
      mime_type: doc.mime_type,
      size_bytes: doc.size_bytes,
      url: signed.signedUrl,
    };
  });
