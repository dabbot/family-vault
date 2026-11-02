// Server only. Sends email through Resend (https://resend.com) and honours unsubscribes.
//
// Settings: RESEND_API_KEY, EMAIL_FROM (e.g. "Family Vault <vault@yourdomain.com>"), APP_URL.
// When RESEND_API_KEY is missing, emails are skipped and the reason is returned.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

function genToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export const emailConfigured = () => !!(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());

export async function isSuppressed(email: string): Promise<boolean> {
  const { data } = await db.from("suppressed_emails").select("email").eq("email", email.toLowerCase().trim()).maybeSingle();
  return !!data;
}

/** One stable token per address, used in the unsubscribe link. */
export async function unsubscribeToken(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const { data: existing } = await db.from("email_unsubscribe_tokens").select("token").eq("email", normalized).maybeSingle();
  if (existing?.token) return existing.token;
  await db.from("email_unsubscribe_tokens").upsert({ email: normalized, token: genToken() }, { onConflict: "email", ignoreDuplicates: true });
  const { data } = await db.from("email_unsubscribe_tokens").select("token").eq("email", normalized).single();
  return data.token;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!emailConfigured()) return { sent: false, reason: "RESEND_API_KEY / EMAIL_FROM not set" };
  if (await isSuppressed(opts.to)) return { sent: false, reason: "unsubscribed" };

  const base = process.env.APP_URL?.trim().replace(/\/+$/, "");
  const token = await unsubscribeToken(opts.to);
  const unsubUrl = base ? `${base}/unsubscribe?token=${token}` : null;
  const html = unsubUrl
    ? `${opts.html}<p style="font-size:12px;color:#888;text-align:center"><a href="${unsubUrl}" style="color:#888">Unsubscribe</a></p>`
    : opts.html;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
      "Content-Type": "application/json",
      ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM!.trim(),
      to: [opts.to],
      subject: opts.subject,
      html,
      text: unsubUrl ? `${opts.text}\n\nUnsubscribe: ${unsubUrl}` : opts.text,
      ...(unsubUrl
        ? { headers: { "List-Unsubscribe": `<${base}/email/unsubscribe?token=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { sent: true };
}
