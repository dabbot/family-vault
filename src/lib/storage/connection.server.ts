// Server only. The family's single storage connection: connect, refresh, disconnect.
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptToken, encryptToken } from "./crypto.server";
import { dropbox } from "./dropbox.server";
import { googleDrive } from "./gdrive.server";
import type { ConnectionState, ProviderId, StorageProvider, TokenSet } from "./types";

export const PROVIDERS: Record<ProviderId, StorageProvider> = { dropbox, google_drive: googleDrive };

export function providerById(id: string): StorageProvider {
  const p = PROVIDERS[id as ProviderId];
  if (!p) throw new Error(`Unknown storage provider: ${id}`);
  return p;
}

/** Public address of this app. Set APP_URL so OAuth redirects match what you registered. */
export function appUrl(request?: Request): string {
  const fromEnv = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (!request) throw new Error("APP_URL is not set.");
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

export const redirectUri = (provider: ProviderId, base: string) => `${base}/api/public/storage/${provider}/callback`;

/* ---------------------------------------------------------------- state */

function stateKey() {
  const k = process.env.TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("Missing key material for OAuth state signing.");
  return k;
}

/** Signed, short-lived value that ties the OAuth callback to the admin who started it. */
export function signState(userId: string, provider: ProviderId): string {
  const payload = `${userId}.${provider}.${Date.now()}`;
  const sig = createHmac("sha256", stateKey()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string, provider: ProviderId): { userId: string } | null {
  try {
    const [userId, p, ts, sig] = Buffer.from(state, "base64url").toString("utf8").split(".");
    if (!userId || !p || !ts || !sig || p !== provider) return null;
    const expected = createHmac("sha256", stateKey()).update(`${userId}.${p}.${ts}`).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}

/* ----------------------------------------------------------- connection */

export async function saveConnection(provider: StorageProvider, tokens: TokenSet, connectedBy: string) {
  const rootFolderId = await provider.prepareRoot(tokens.accessToken);
  const { error } = await supabaseAdmin.from("storage_connections").upsert({
    id: 1,
    provider: provider.id,
    account_label: tokens.accountLabel,
    refresh_token_enc: await encryptToken(tokens.refreshToken),
    access_token_enc: await encryptToken(tokens.accessToken),
    access_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    root_folder_id: rootFolderId,
    cursor: null,
    last_synced_at: null,
    last_error: null,
    connected_by: connectedBy,
    connected_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not save the storage connection: ${error.message}`);
}

export async function disconnect() {
  await supabaseAdmin.from("storage_connections").delete().eq("id", 1);
}

export async function connectionStatus() {
  const { data } = await supabaseAdmin
    .from("storage_connections")
    .select("provider, account_label, last_synced_at, last_error, connected_at")
    .eq("id", 1)
    .maybeSingle();
  return data;
}

/** The live connection with a fresh access token, or null when no storage is linked. */
export async function activeConnection(): Promise<(ConnectionState & { provider: ProviderId }) | null> {
  const { data: row } = await supabaseAdmin.from("storage_connections").select("*").eq("id", 1).maybeSingle();
  if (!row) return null;
  const provider = providerById(row.provider);
  let accessToken = row.access_token_enc ? await decryptToken(row.access_token_enc) : null;
  const expiresAt = row.access_expires_at ? Date.parse(row.access_expires_at) : 0;
  if (!accessToken || expiresAt < Date.now() + 60_000) {
    const fresh = await provider.refresh(await decryptToken(row.refresh_token_enc));
    accessToken = fresh.accessToken;
    await supabaseAdmin
      .from("storage_connections")
      .update({
        access_token_enc: await encryptToken(fresh.accessToken),
        access_expires_at: new Date(Date.now() + fresh.expiresIn * 1000).toISOString(),
      })
      .eq("id", 1);
  }
  return { provider: provider.id, accessToken, rootFolderId: row.root_folder_id, cursor: row.cursor };
}

export async function recordSync(cursor: string | null, error: string | null) {
  await supabaseAdmin
    .from("storage_connections")
    .update({ ...(cursor ? { cursor } : {}), last_synced_at: new Date().toISOString(), last_error: error })
    .eq("id", 1);
}
