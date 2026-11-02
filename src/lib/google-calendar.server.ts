import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

export function getRedirectUri(origin: string) {
  return `${origin}/api/public/google-calendar/callback`;
}

function hmacKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Missing key material for state signing");
  return key;
}

export function signState(userId: string, origin: string): string {
  const payload = `${userId}.${origin}.${Date.now()}`;
  const sig = createHmac("sha256", hmacKey()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string): { userId: string; origin: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 4) return null;
    const [userId, origin, ts, sig] = parts;
    const payload = `${userId}.${origin}.${ts}`;
    const expected = createHmac("sha256", hmacKey()).update(payload).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    // 15 min window
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
    return { userId, origin };
  } catch {
    return null;
  }
}

export function buildAuthUrl(origin: string, state: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, origin: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token?: string;
  }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number; scope: string; token_type: string }>;
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { email?: string };
  return j.email ?? null;
}

export type CalEvent = {
  summary: string;
  description?: string;
  date: string; // YYYY-MM-DD all-day
};

export async function upsertCalendarEvent(opts: {
  accessToken: string;
  calendarId: string;
  eventId?: string | null;
  event: CalEvent;
}): Promise<{ id: string }> {
  const { accessToken, calendarId, eventId, event } = opts;
  const body = {
    summary: event.summary,
    description: event.description ?? "",
    start: { date: event.date },
    end: { date: event.date },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 7 * 24 * 60 },
        { method: "popup", minutes: 1 * 24 * 60 },
        { method: "email", minutes: 7 * 24 * 60 },
      ],
    },
    ...(process.env.APP_URL?.trim() ? { source: { title: "Family Vault", url: process.env.APP_URL.trim() } } : {}),
  };

  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const url = eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
  const method = eventId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 404 && eventId) {
    // Event was deleted on Google side — recreate
    return upsertCalendarEvent({ ...opts, eventId: null });
  }
  if (!res.ok) throw new Error(`Calendar upsert failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { id: string };
  return { id: j.id };
}

export async function deleteCalendarEvent(opts: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}) {
  const { accessToken, calendarId, eventId } = opts;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Calendar delete failed: ${res.status} ${await res.text()}`);
  }
}
