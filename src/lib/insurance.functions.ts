import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ExtractInput = z.object({ documentId: z.string().uuid() });

export const extractInsuranceFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExtractInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, owner_id, storage_path, mime_type, title, family_slot, member_name, ocr_text")
      .eq("id", data.documentId)
      .single();
    if (docErr || !doc) throw new Error("Document not found");

    const ai = (await import("./ai.server")).aiConfig("fast");

    const rawMime = doc.mime_type ?? "application/octet-stream";
    const lowerName = (doc.title ?? "").toLowerCase();
    const lowerPath = (doc.storage_path ?? "").toLowerCase();
    const extOf = (s: string) => {
      const m = s.match(/\.([a-z0-9]+)(?:$|\?)/);
      return m ? m[1] : "";
    };
    const ext = extOf(lowerName) || extOf(lowerPath);
    const imageExts = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "heic"];
    const extMime: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      webp: "image/webp", gif: "image/gif", bmp: "image/bmp", heic: "image/heic",
      pdf: "application/pdf",
    };
    const isPdf = rawMime === "application/pdf" || ext === "pdf";
    const isImage = rawMime.startsWith("image/") || imageExts.includes(ext);
    const isDocx =
      rawMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx";
    const isXlsx =
      rawMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      rawMime === "application/vnd.ms-excel" ||
      ext === "xlsx" ||
      ext === "xls" ||
      ext === "csv";
    const mime = isPdf
      ? "application/pdf"
      : isImage && !rawMime.startsWith("image/")
        ? extMime[ext] ?? "image/jpeg"
        : rawMime;

    const prompt = `You are reading a document that may list one or MORE insurance policies (life, health, car, term, ULIP, endowment, etc.). Extract EVERY policy you can find.

Respond ONLY with a JSON object (no markdown) of this exact shape:
{
  "policies": [
    {
      "policy_name": "short label, e.g. 'LIC Jeevan Anand'",
      "policy_number": "string or null",
      "provider": "insurer name or null",
      "policy_type": "life | health | car | term | ulip | endowment | other | null",
      "member_name": "person insured or null",
      "premium_amount": number or null,
      "premium_frequency": "monthly | quarterly | half-yearly | yearly | single | null",
      "premium_due_date": "YYYY-MM-DD or null (next upcoming premium due date)",
      "sum_assured": number or null,
      "maturity_date": "YYYY-MM-DD or null",
      "maturity_amount": number or null,
      "start_date": "YYYY-MM-DD or null",
      "notes": "any extra useful detail or null"
    }
  ]
}

Date parsing rules: 'April 2027' → 2027-04-30; '04/2027' → 2027-04-30; if only month+year, use last day of month. Use null when unsure. Do not invent values.`;

    const content: Array<Record<string, unknown>> = [];
    content.push({ type: "text", text: prompt });

    if (isPdf || isImage) {
      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from("documents")
        .download(doc.storage_path);
      if (dlErr || !fileBlob) throw new Error("Could not read file");
      const buf = await fileBlob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      }
      const base64 = btoa(binary);
      if (isPdf) {
        content.push({
          type: "file",
          file: { filename: doc.title ?? "doc.pdf", file_data: `data:application/pdf;base64,${base64}` },
        });
      } else {
        content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } });
      }
    } else if (isDocx) {
      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from("documents")
        .download(doc.storage_path);
      if (dlErr || !fileBlob) throw new Error("Could not read file");
      const buf = await fileBlob.arrayBuffer();
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      const text = (result.value || "").trim();
      if (!text) throw new Error("Word document appears to be empty");
      content.push({ type: "text", text: `Document text:\n${text.slice(0, 18000)}` });
    } else if (isXlsx) {
      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from("documents")
        .download(doc.storage_path);
      if (dlErr || !fileBlob) throw new Error("Could not read file");
      const buf = await fileBlob.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const parts: string[] = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) parts.push(`# Sheet: ${name}\n${csv}`);
      }
      const text = parts.join("\n\n").trim();
      if (!text) throw new Error("Spreadsheet appears to be empty");
      content.push({ type: "text", text: `Spreadsheet contents (CSV per sheet):\n${text.slice(0, 18000)}` });
    } else if (doc.ocr_text) {
      content.push({ type: "text", text: `Document text:\n${doc.ocr_text.slice(0, 18000)}` });
    } else {
      throw new Error(`Unsupported file type for extraction (${rawMime || ext || "unknown"})`);
    }

    const aiRes = await fetch(ai.url, {
      method: "POST",
      headers: ai.headers,
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: "user", content }],
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI error ${aiRes.status}: ${txt.slice(0, 200)}`);
    }
    const json = await aiRes.json();
    const text: string = json.choices?.[0]?.message?.content ?? "{}";
    const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
    let parsed: { policies?: Array<Record<string, unknown>> } = {};
    try { parsed = JSON.parse(cleaned); } catch { parsed = {}; }
    const list = Array.isArray(parsed.policies) ? parsed.policies : [];
    if (list.length === 0) return { inserted: 0 };

    const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const num = (v: unknown): number | null => {
      if (v == null) return null;
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[, ]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

    const rows = list.map((p) => ({
      owner_id: userId,
      family_slot: doc.family_slot ?? null,
      member_name: str(p.member_name) ?? doc.member_name ?? null,
      policy_name: str(p.policy_name) ?? "Untitled policy",
      policy_number: str(p.policy_number),
      provider: str(p.provider),
      policy_type: str(p.policy_type),
      premium_amount: num(p.premium_amount),
      premium_frequency: str(p.premium_frequency),
      premium_due_date: isDate(p.premium_due_date) ? p.premium_due_date : null,
      sum_assured: num(p.sum_assured),
      maturity_date: isDate(p.maturity_date) ? p.maturity_date : null,
      maturity_amount: num(p.maturity_amount),
      start_date: isDate(p.start_date) ? p.start_date : null,
      notes: str(p.notes),
      source_document_id: doc.id,
    }));

    // Normalize policy numbers for matching (strip spaces/dashes, lowercase)
    const normalize = (s: string | null) =>
      s ? s.replace(/[\s\-_/]/g, "").toLowerCase() : null;

    const numbers = Array.from(
      new Set(rows.map((r) => r.policy_number).filter((n): n is string => !!n)),
    );

    type ExistingPolicy = typeof rows[number] & { id: string };
    let existing: ExistingPolicy[] = [];
    if (numbers.length > 0) {
      const { data: ex } = await supabase
        .from("insurance_policies")
        .select("*")
        .not("policy_number", "is", null);
      existing = (ex ?? []) as ExistingPolicy[];
    }
    const existingByNum = new Map<string, ExistingPolicy>();
    for (const e of existing) {
      const k = normalize(e.policy_number);
      if (k) existingByNum.set(k, e);
    }

    let inserted = 0;
    let merged = 0;
    const toInsert: typeof rows = [];

    for (const r of rows) {
      const key = normalize(r.policy_number);
      const match = key ? existingByNum.get(key) : null;
      if (match) {
        // Enrich: fill missing fields on existing record; keep existing non-null values
        const enrichable: Array<keyof typeof rows[number]> = [
          "family_slot", "member_name", "policy_name", "provider", "policy_type",
          "premium_amount", "premium_frequency", "premium_due_date",
          "sum_assured", "maturity_date", "maturity_amount", "start_date",
        ];
        const patch: Record<string, unknown> = {};
        for (const k of enrichable) {
          if ((match as Record<string, unknown>)[k] == null && (r as Record<string, unknown>)[k] != null) {
            patch[k] = (r as Record<string, unknown>)[k];
          }
        }
        // Append notes if new info present
        if (r.notes && r.notes !== match.notes) {
          patch.notes = match.notes ? `${match.notes}\n\n${r.notes}` : r.notes;
        }
        if (Object.keys(patch).length > 0) {
          await supabase.from("insurance_policies").update(patch as never).eq("id", match.id);
        }
        merged++;
      } else {
        toInsert.push(r);
        if (key) existingByNum.set(key, { ...r, id: "pending" } as ExistingPolicy);
      }
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from("insurance_policies").insert(toInsert);
      if (insErr) throw new Error(insErr.message);
      inserted = toInsert.length;
    }
    return { inserted, merged };
  });
