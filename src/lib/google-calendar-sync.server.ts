import { refreshAccessToken, upsertCalendarEvent, deleteCalendarEvent, type CalEvent } from "./google-calendar.server";

type SupabaseLike = any;

async function getValidAccessToken(supabase: SupabaseLike, userId: string) {
  const { data: row, error } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token, access_token, expires_at, calendar_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row) throw new Error("Google Calendar not connected");

  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  const needsRefresh = !row.access_token || exp - Date.now() < 60_000;
  if (!needsRefresh) {
    return { accessToken: row.access_token as string, calendarId: row.calendar_id || "primary" };
  }

  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from("google_oauth_tokens")
    .update({ access_token: refreshed.access_token, expires_at: newExpiry })
    .eq("user_id", userId);
  return { accessToken: refreshed.access_token, calendarId: row.calendar_id || "primary" };
}

function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null;
  // Normalize to YYYY-MM-DD
  return d.slice(0, 10);
}

type DesiredEvent = {
  source_kind: "doc_expiry" | "policy_premium" | "policy_maturity";
  source_id: string;
  event_date: string;
  summary: string;
  description: string;
};

export async function runSyncForUser(supabase: SupabaseLike, userId: string) {
  const { accessToken, calendarId } = await getValidAccessToken(supabase, userId);

  const todayIso = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setFullYear(horizon.getFullYear() + 2);
  const horizonIso = horizon.toISOString().slice(0, 10);

  // 1. Document expiries (family-wide, visible to this user via RLS)
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, doc_type, expiry_date, member_name, family_slot")
    .not("expiry_date", "is", null)
    .gte("expiry_date", todayIso)
    .lte("expiry_date", horizonIso)
    .is("deleted_at", null);

  // 2. Insurance policies
  const { data: policies } = await supabase
    .from("insurance_policies")
    .select("id, policy_name, insurer, policy_number, member_name, premium_due_date, maturity_date");

  const desired: DesiredEvent[] = [];

  for (const d of docs ?? []) {
    const date = fmtDate(d.expiry_date);
    if (!date) continue;
    const who = d.member_name ? ` (${d.member_name})` : "";
    desired.push({
      source_kind: "doc_expiry",
      source_id: d.id,
      event_date: date,
      summary: `📄 Expires: ${d.title}${who}`,
      description: [
        d.doc_type ? `Type: ${d.doc_type}` : null,
        d.member_name ? `For: ${d.member_name}` : null,
        "Family Vault · Document expiry",
      ].filter(Boolean).join("\n"),
    });
  }

  for (const p of policies ?? []) {
    const due = fmtDate(p.premium_due_date);
    if (due && due >= todayIso && due <= horizonIso) {
      desired.push({
        source_kind: "policy_premium",
        source_id: p.id,
        event_date: due,
        summary: `💰 Premium due: ${p.policy_name}`,
        description: [
          p.insurer ? `Insurer: ${p.insurer}` : null,
          p.policy_number ? `Policy #: ${p.policy_number}` : null,
          p.member_name ? `For: ${p.member_name}` : null,
          "Family Vault · Insurance premium",
        ].filter(Boolean).join("\n"),
      });
    }
    const mat = fmtDate(p.maturity_date);
    if (mat && mat >= todayIso && mat <= horizonIso) {
      desired.push({
        source_kind: "policy_maturity",
        source_id: p.id,
        event_date: mat,
        summary: `🎯 Maturity: ${p.policy_name}`,
        description: [
          p.insurer ? `Insurer: ${p.insurer}` : null,
          p.policy_number ? `Policy #: ${p.policy_number}` : null,
          p.member_name ? `For: ${p.member_name}` : null,
          "Family Vault · Insurance maturity",
        ].filter(Boolean).join("\n"),
      });
    }
  }

  // Existing tracked events for this user
  const { data: existing } = await supabase
    .from("synced_calendar_events")
    .select("id, source_kind, source_id, event_date, google_event_id, calendar_id")
    .eq("user_id", userId);

  const existingMap = new Map<string, any>();
  for (const e of existing ?? []) {
    existingMap.set(`${e.source_kind}:${e.source_id}`, e);
  }
  const desiredKeys = new Set(desired.map((d) => `${d.source_kind}:${d.source_id}`));

  let created = 0, updated = 0, deleted = 0, failed = 0;
  const errors: string[] = [];

  // Upserts
  for (const d of desired) {
    const key = `${d.source_kind}:${d.source_id}`;
    const prev = existingMap.get(key);
    try {
      const ev: CalEvent = { summary: d.summary, description: d.description, date: d.event_date };
      const { id: gEventId } = await upsertCalendarEvent({
        accessToken,
        calendarId,
        eventId: prev?.google_event_id ?? null,
        event: ev,
      });
      if (prev) {
        await supabase
          .from("synced_calendar_events")
          .update({
            event_date: d.event_date,
            google_event_id: gEventId,
            calendar_id: calendarId,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", prev.id);
        updated++;
      } else {
        await supabase.from("synced_calendar_events").insert({
          user_id: userId,
          source_kind: d.source_kind,
          source_id: d.source_id,
          event_date: d.event_date,
          google_event_id: gEventId,
          calendar_id: calendarId,
        });
        created++;
      }
    } catch (e) {
      failed++;
      errors.push(`${key}: ${(e as Error).message}`);
    }
  }

  // Deletes (source removed or out of range)
  for (const e of existing ?? []) {
    const key = `${e.source_kind}:${e.source_id}`;
    if (desiredKeys.has(key)) continue;
    try {
      await deleteCalendarEvent({ accessToken, calendarId: e.calendar_id, eventId: e.google_event_id });
      await supabase.from("synced_calendar_events").delete().eq("id", e.id);
      deleted++;
    } catch (err) {
      failed++;
      errors.push(`delete ${key}: ${(err as Error).message}`);
    }
  }

  return { created, updated, deleted, failed, total: desired.length, errors };
}
