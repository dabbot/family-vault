import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Postmark inbound JSON shape (subset)
interface PostmarkAttachment {
  Name: string;
  Content: string; // base64
  ContentType: string;
  ContentLength: number;
}

interface PostmarkInbound {
  FromFull?: { Email: string; Name?: string };
  From?: string;
  ToFull?: { Email: string; MailboxHash?: string }[];
  To?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Attachments?: PostmarkAttachment[];
  MessageID?: string;
}

function checkBasicAuth(req: Request): boolean {
  const expectedUser = process.env.POSTMARK_WEBHOOK_USER;
  const expectedPass = process.env.POSTMARK_WEBHOOK_PASSWORD;
  if (!expectedUser || !expectedPass) return false;
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6).trim());
    const idx = decoded.indexOf(":");
    if (idx < 0) return false;
    const providedUser = decoded.slice(0, idx);
    const providedPass = decoded.slice(idx + 1);
    let decodedProvidedPass = providedPass;
    try {
      decodedProvidedPass = decodeURIComponent(providedPass);
    } catch {
      decodedProvidedPass = providedPass;
    }
    return providedUser === expectedUser && (providedPass === expectedPass || decodedProvidedPass === expectedPass);
  } catch {
    return false;
  }
}

function extractAlias(toAddress: string | undefined): string | null {
  if (!toAddress) return null;
  // e.g. "alice.abc123@docs.example.com" → "alice.abc123"
  const match = toAddress.match(/<?([^<@\s]+)@/);
  return match ? match[1].toLowerCase() : null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "attachment";
}

export const Route = createFileRoute("/api/public/hooks/postmark-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!checkBasicAuth(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: PostmarkInbound;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const fromEmail = payload.FromFull?.Email ?? payload.From ?? null;
        const toEmail = payload.ToFull?.[0]?.Email ?? payload.To ?? null;
        const alias = extractAlias(toEmail ?? undefined);
        const subject = payload.Subject ?? "Untitled";
        const attachments = payload.Attachments ?? [];

        // Log the event first so we always have a trace
        const baseEvent = {
          alias,
          status: "received",
          raw_payload: {
            from: fromEmail,
            to: toEmail,
            subject,
            attachment_count: attachments.length,
            message_id: payload.MessageID ?? null,
          },
        };

        if (!alias) {
          await supabaseAdmin.from("inbound_events").insert({
            ...baseEvent,
            status: "error",
            error: "No alias in To address",
          });
          return Response.json({ ok: false, reason: "no_alias" });
        }

        // Resolve alias → owner. Try shared family alias first, then per-user alias.
        let ownerId: string | null = null;
        let memberName: string | null = null;

        const { data: family } = await supabaseAdmin
          .from("family_settings")
          .select("family_alias")
          .eq("id", true)
          .maybeSingle();

        const normalizedFrom = (fromEmail ?? "")
          .match(/<?([^<>\s]+@[^<>\s]+)>?/)?.[1]
          ?.toLowerCase() ?? null;

        if (family?.family_alias && family.family_alias.toLowerCase() === alias) {
          // Look up family member by sender email for categorization
          if (normalizedFrom) {
            const { data: member } = await supabaseAdmin
              .from("family_members")
              .select("name")
              .eq("email", normalizedFrom)
              .maybeSingle();
            memberName = member?.name ?? null;
          }

          // Single shared vault: route ownership to the first admin
          const { data: adminRole } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          ownerId = adminRole?.user_id ?? null;
        }

        if (!ownerId) {
          const { data: profile, error: profileErr } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("inbound_alias", alias)
            .maybeSingle();
          if (profileErr || !profile) {
            await supabaseAdmin.from("inbound_events").insert({
              ...baseEvent,
              status: "error",
              error: profileErr?.message ?? `Unknown alias: ${alias}`,
            });
            return Response.json({ ok: false, reason: "unknown_alias" });
          }
          ownerId = profile.id;
        }


        if (attachments.length === 0) {
          await supabaseAdmin.from("inbound_events").insert({
            ...baseEvent,
            matched_owner: ownerId,
            status: "ignored",
            error: "No attachments",
          });
          return Response.json({ ok: true, ingested: 0 });
        }

        let ingested = 0;
        let firstDocId: string | null = null;
        const errors: string[] = [];

        for (const att of attachments) {
          try {
            const filename = sanitizeFilename(att.Name);
            const path = `${ownerId}/inbound/${Date.now()}-${crypto.randomUUID()}-${filename}`;
            const bytes = Uint8Array.from(atob(att.Content), (c) => c.charCodeAt(0));

            const { error: upErr } = await supabaseAdmin.storage
              .from("documents")
              .upload(path, bytes, {
                contentType: att.ContentType || "application/octet-stream",
                upsert: false,
              });
            if (upErr) throw new Error(`upload: ${upErr.message}`);

            const { data: doc, error: insErr } = await supabaseAdmin
              .from("documents")
              .insert({
                owner_id: ownerId,
                title: att.Name || subject,
                storage_path: path,
                mime_type: att.ContentType,
                size_bytes: att.ContentLength,
                source: "email",
                notes: subject,
                member_name: memberName,
              })
              .select("id")
              .single();
            if (insErr) throw new Error(`insert: ${insErr.message}`);

            if (!firstDocId) firstDocId = doc.id;
            ingested++;
          } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
          }
        }

        await supabaseAdmin.from("inbound_events").insert({
          ...baseEvent,
          matched_owner: ownerId,
          document_id: firstDocId,
          status: ingested > 0 ? "processed" : "error",
          processed_at: new Date().toISOString(),
          error: errors.length ? errors.join("; ") : null,
        });

        return Response.json({ ok: true, ingested, errors });
      },
    },
  },
});
