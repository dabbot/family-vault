import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

const ExtractInput = z.object({ documentId: z.string().uuid() });

export async function runExtraction(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
) {
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, owner_id, storage_path, mime_type, title, category_id")
    .eq("id", documentId)
    .single();
  if (docErr || !doc) throw new Error("Document not found");
  if (doc.owner_id !== userId) throw new Error("Forbidden");

  const { data: cats } = await supabase.from("categories").select("id, slug");
  const slugToId: Record<string, string> = {};
  (cats ?? []).forEach((c: { id: string; slug: string }) => {
    slugToId[c.slug] = c.id;
  });

  const typeToSlug: Record<string, string> = {
    passport: "identity", pan: "identity", aadhaar: "identity", driving_license: "identity",
    vehicle_rc: "vehicle", puc: "vehicle",
    car_insurance: "insurance", health_insurance: "insurance", life_insurance: "insurance",
    itr: "tax",
  };

  const guessSlugFromName = (name: string): string | null => {
    const n = name.toLowerCase();
    if (/passport/.test(n)) return "identity";
    if (/\b(pan|aadhaar|aadhar|licen[cs]e|voter|identity|id[ -]?card)\b/.test(n)) return "identity";
    if (/\b(rc|vehicle|puc|pollution|car|bike|registration)\b/.test(n)) return "vehicle";
    if (/insur|policy|mediclaim/.test(n)) return "insurance";
    if (/\b(itr|tax|gst|form ?16|salary|invoice|receipt|bank|statement)\b/.test(n)) return "tax";
    if (/\b(health|medical|prescription|report|lab|hospital|vaccin)\b/.test(n)) return "health";
    return null;
  };

  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);
  if (dlErr || !fileBlob) throw new Error("Could not read file");

  const buf = await fileBlob.arrayBuffer();
  // Chunked base64 — String.fromCharCode(...bigArray) overflows the call stack
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  const base64 = btoa(binary);
  const mime = doc.mime_type ?? "application/octet-stream";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";

  if (!isImage && !isPdf) {
    const update: { ai_processed: boolean; category_id?: string } = { ai_processed: true };
    if (!doc.category_id) {
      const slug = guessSlugFromName(doc.title ?? "");
      if (slug && slugToId[slug]) update.category_id = slugToId[slug];
    }
    await supabase.from("documents").update(update).eq("id", doc.id);
    return { ok: true, skipped: true };
  }

  const ai = (await import("./ai.server")).aiConfig("fast");

  const prompt = `Analyze this document and extract structured information. It might be a passport, PAN card, Aadhaar, driving license, vehicle RC, pollution certificate (PUC), insurance policy, ITR, or similar identity/financial document.

Respond ONLY with a JSON object (no markdown) with these fields (use null if not present):
{
  "doc_type": "passport" | "pan" | "aadhaar" | "driving_license" | "vehicle_rc" | "puc" | "car_insurance" | "health_insurance" | "life_insurance" | "itr" | "other",
  "doc_number": "string or null",
  "issuer": "string or null",
  "issue_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null (parse dates like 'April 2027' as 2027-04-30, '04/2027' as 2027-04-30; if only month+year, use last day of month)",
  "summary": "one-line description",
  "ocr_text": "full plain-text transcription of every visible word on the document, preserving line breaks. Used for search — include everything readable."
}`;

  const aiRes = await fetch(ai.url, {
    method: "POST",
    headers: ai.headers,
    body: JSON.stringify({
      model: ai.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
    }),
  });

  if (!aiRes.ok) {
    const txt = await aiRes.text();
    throw new Error(`AI error ${aiRes.status}: ${txt.slice(0, 200)}`);
  }

  const json = await aiRes.json();
  const content: string = json.choices?.[0]?.message?.content ?? "{}";
  const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();
  let parsed: Record<string, string | null> = {};
  try { parsed = JSON.parse(cleaned); } catch { parsed = {}; }

  const update: {
    ai_processed: boolean;
    doc_type?: string;
    doc_number?: string;
    issuer?: string;
    issue_date?: string;
    expiry_date?: string;
    ai_summary?: string;
    category_id?: string;
    ocr_text?: string;
    needs_review?: boolean;
  } = { ai_processed: true };
  if (parsed.doc_type) update.doc_type = parsed.doc_type;
  if (parsed.doc_number) update.doc_number = parsed.doc_number;
  if (parsed.issuer) update.issuer = parsed.issuer;
  if (parsed.issue_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.issue_date)) update.issue_date = parsed.issue_date;
  if (parsed.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiry_date)) update.expiry_date = parsed.expiry_date;
  if (parsed.summary) update.ai_summary = parsed.summary;
  if (parsed.ocr_text && typeof parsed.ocr_text === "string") {
    update.ocr_text = parsed.ocr_text.slice(0, 20000);
  }

  if (!doc.category_id) {
    const slug =
      (parsed.doc_type && typeToSlug[parsed.doc_type]) ||
      guessSlugFromName(doc.title ?? "") ||
      null;
    if (slug && slugToId[slug]) update.category_id = slugToId[slug];
  }

  // Flag for review when we couldn't infer key fields
  const finalCategory = update.category_id ?? doc.category_id;
  update.needs_review = !finalCategory || !update.doc_type || (!update.expiry_date && (update.doc_type === "passport" || update.doc_type === "driving_license" || update.doc_type === "vehicle_rc" || update.doc_type === "puc" || update.doc_type === "car_insurance" || update.doc_type === "health_insurance" || update.doc_type === "life_insurance"));

  await supabase.from("documents").update(update).eq("id", doc.id);

  if (update.expiry_date) {
    const expiry = new Date(update.expiry_date as string);
    const reminders = [
      { offset: 30, kind: "30d" },
      { offset: 7, kind: "7d" },
      { offset: 1, kind: "1d" },
      { offset: 0, kind: "day_of" },
    ].map((r) => {
      const d = new Date(expiry);
      d.setDate(d.getDate() - r.offset);
      return {
        document_id: doc.id,
        owner_id: userId,
        fires_at: d.toISOString().slice(0, 10),
        kind: r.kind,
      };
    });
    await supabase.from("reminders").delete().eq("document_id", doc.id);
    await supabase.from("reminders").insert(reminders);
  }

  return { ok: true, extracted: parsed };
}

export const extractDocumentMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ExtractInput.parse(input))
  .handler(async ({ data, context }) => {
    return runExtraction(context.supabase, context.userId, data.documentId);
  });

export const reprocessPendingDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pending } = await supabase
      .from("documents")
      .select("id")
      .eq("owner_id", userId)
      .eq("ai_processed", false)
      .limit(20);
    const ids = (pending ?? []).map((d: { id: string }) => d.id);
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await runExtraction(supabase, userId, id);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { processed: results.length, results };
  });
