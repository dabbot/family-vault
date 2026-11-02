import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AskInput = z.object({
  question: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8000),
  })).max(20).default([]),
});

type DocHit = {
  id: string;
  title: string;
  doc_type: string | null;
  issuer: string | null;
  expiry_date: string | null;
  ai_summary: string | null;
  ocr_text: string | null;
  owner_id: string;
};

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter(
    (t) => !["the","and","for","with","that","this","what","when","where","which","have","does","from","your","you","are","can","how","who","why","but","not","all","any"].includes(t)
  );
}

function snippet(text: string, terms: string[], radius = 400): string {
  const lower = text.toLowerCase();
  const positions: number[] = [];
  for (const t of terms) {
    let from = 0;
    while (from < lower.length) {
      const i = lower.indexOf(t, from);
      if (i === -1) break;
      positions.push(i);
      from = i + t.length;
    }
  }
  if (positions.length === 0) return text.slice(0, Math.min(text.length, 2000));
  positions.sort((a, b) => a - b);
  const windows: Array<[number, number]> = [];
  for (const p of positions) {
    const start = Math.max(0, p - radius);
    const end = Math.min(text.length, p + radius);
    const last = windows[windows.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      windows.push([start, end]);
    }
    if (windows.length >= 4) break;
  }
  return windows
    .map(([s, e], i) => (i === 0 && s > 0 ? "…" : "") + text.slice(s, e) + (e < text.length ? "…" : ""))
    .join(" ");
}

export const askVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AskInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Pull a working set the user can read (RLS handles privacy/family)
    const { data: docsRaw, error } = await supabase
      .from("documents")
      .select("id,title,doc_type,issuer,expiry_date,ai_summary,ocr_text,owner_id")
      .is("deleted_at", null)
      .limit(400);
    if (error) throw new Error("Could not read vault");

    const docs = (docsRaw ?? []) as DocHit[];
    const terms = tokens(data.question);
    const scored = docs.map((d) => {
      const blob = [d.title, d.doc_type, d.issuer, d.ai_summary, d.ocr_text].filter(Boolean).join(" ").toLowerCase();
      let score = 0;
      for (const t of terms) {
        const occ = blob.split(t).length - 1;
        score += occ;
        if (d.title?.toLowerCase().includes(t)) score += 2;
      }
      return { d, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);

    const topDocs = scored.length > 0 ? scored.map((x) => x.d) : docs.slice(0, 4);

    const contextBlock = topDocs.map((d, i) => {
      const ocr = d.ocr_text ?? "";
      const body =
        i === 0 && ocr.length > 0 && ocr.length <= 6000
          ? ocr
          : ocr
            ? snippet(ocr, terms)
            : (d.ai_summary ?? "");
      return `[${i + 1}] ${d.title}${d.doc_type ? ` (${d.doc_type})` : ""}${d.expiry_date ? ` · expires ${d.expiry_date}` : ""}${d.issuer ? ` · issuing authority: ${d.issuer}` : ""}\nFULL TEXT:\n${body}`;
    }).join("\n\n---\n\n");

    const ai = (await import("./ai.server")).aiConfig("smart");

    const systemPrompt = `You are the family document vault assistant. Answer the user's question using the document excerpts below (OCR text from scans). Cite sources inline with [1], [2], etc.

Important distinctions when reading IDs and passports:
- "Issuing authority" / "issued by" refers to the country or organisation (e.g. "Republic of India"), NOT a city.
- "Place of issue" is the city/office where the document was issued (e.g. "DELHI", "MUMBAI"). It is DIFFERENT from "Place of birth" and from "Date of issue".
- Read the FULL TEXT carefully — look for labels like "Place of Issue", "जारी करने का स्थान", or a city name appearing near the issue date. OCR may contain minor character errors; use judgement.
- If a question asks about a specific field, scan the FULL TEXT for it before saying it's missing.

If the answer truly isn't in the documents, say so plainly. Keep answers short and clear. Today is ${new Date().toISOString().slice(0, 10)}.

DOCUMENTS:
${contextBlock || "(no documents matched)"}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...data.history.slice(-10),
      { role: "user", content: data.question },
    ];

    const aiRes = await fetch(ai.url, {
      method: "POST",
      headers: ai.headers,
      body: JSON.stringify({
        model: ai.model,
        messages,
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429) throw new Error("Rate limit reached — please try again in a moment.");
      if (aiRes.status === 402) throw new Error("The AI provider says the account is out of credit.");
      throw new Error(`AI error: ${txt.slice(0, 200)}`);
    }

    const json = await aiRes.json();
    const answer: string = json.choices?.[0]?.message?.content ?? "(no response)";

    const citations = topDocs.map((d, i) => ({
      index: i + 1,
      id: d.id,
      title: d.title,
      doc_type: d.doc_type,
    }));

    // Persist to chat history
    await supabase.from("chat_messages").insert([
      { user_id: userId, role: "user", content: data.question },
      { user_id: userId, role: "assistant", content: answer, citations },
    ]);

    return { answer, citations };
  });

export const clearChatHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("chat_messages").delete().eq("user_id", context.userId);
    return { ok: true };
  });
