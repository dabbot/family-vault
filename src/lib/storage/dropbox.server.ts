// Server only. Dropbox adapter.
//
// The family creates their own Dropbox app with "App folder" access, so the API root
// is /Apps/<their app name>/ in their Dropbox. Each family member and shared folder is a
// top-level folder there: /Alex/passport.pdf, /Car Insurance/policy.pdf.
import type { ConnectionState, RemoteFile, StorageProvider, TokenSet } from "./types";

const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";
const SCOPES = ["files.metadata.read", "files.content.read", "files.content.write"];

type Entry = { ".tag": "file" | "folder" | "deleted"; id?: string; name: string; path_display?: string; size?: number };
type ListResult = { entries: Entry[]; cursor: string; has_more: boolean };

function creds() {
  const key = process.env.DROPBOX_APP_KEY?.trim();
  const secret = process.env.DROPBOX_APP_SECRET?.trim();
  if (!key || !secret) throw new Error("Dropbox is not set up on this server. Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET.");
  return { key, secret };
}

async function tokenRequest(body: Record<string, string>) {
  const { key, secret } = creds();
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Dropbox sign-in failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in: number; account_id?: string };
}

function explain(action: string, status: number, body: string): Error {
  if (status === 401 || body.includes("missing_scope") || body.includes("files.content.write")) {
    return new Error(`Dropbox ${action} was refused. Give the Dropbox app these permissions: ${SCOPES.join(", ")}, then reconnect Dropbox.`);
  }
  return new Error(`Dropbox ${action} failed (${status}): ${body.slice(0, 300)}`);
}

async function rpc<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw explain(path.replace(/^\/files\//, ""), res.status, await res.text());
  return (await res.json()) as T;
}

const toRemote = (e: Entry): RemoteFile | null =>
  e[".tag"] === "file" && e.id && e.path_display
    ? { id: e.id, name: e.name, path: e.path_display.replace(/^\//, "").split("/"), size: e.size ?? null }
    : null;

async function walk(token: string, cursor: string | null): Promise<{ files: RemoteFile[]; cursor: string }> {
  let page: ListResult = cursor
    ? await rpc<ListResult>(token, "/files/list_folder/continue", { cursor }).catch(() =>
        // An expired cursor means a full re-list; already-imported files are skipped by id.
        rpc<ListResult>(token, "/files/list_folder", { path: "", recursive: true }),
      )
    : await rpc<ListResult>(token, "/files/list_folder", { path: "", recursive: true, include_non_downloadable_files: false });
  const files: RemoteFile[] = [];
  for (;;) {
    for (const e of page.entries) {
      const f = toRemote(e);
      if (f) files.push(f);
    }
    if (!page.has_more) break;
    page = await rpc<ListResult>(token, "/files/list_folder/continue", { cursor: page.cursor });
  }
  return { files, cursor: page.cursor };
}

export const dropbox: StorageProvider = {
  id: "dropbox",
  label: "Dropbox",
  configured: () => !!(process.env.DROPBOX_APP_KEY?.trim() && process.env.DROPBOX_APP_SECRET?.trim()),

  authUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: creds().key,
      response_type: "code",
      token_access_type: "offline",
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
    });
    return `https://www.dropbox.com/oauth2/authorize?${params}`;
  },

  async exchangeCode(code, redirectUri): Promise<TokenSet> {
    const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
    if (!t.refresh_token) throw new Error("Dropbox did not return a refresh token. Try connecting again.");
    return { refreshToken: t.refresh_token, accessToken: t.access_token, expiresIn: t.expires_in, accountLabel: "Dropbox app folder" };
  },

  async refresh(refreshToken) {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { accessToken: t.access_token, expiresIn: t.expires_in };
  },

  prepareRoot: async () => null,

  listChanges: (conn: ConnectionState) => walk(conn.accessToken, conn.cursor),
  listAll: async (conn) => (await walk(conn.accessToken, null)).files,

  async download(conn, file) {
    const res = await fetch(`${CONTENT}/files/download`, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.accessToken}`, "Dropbox-API-Arg": JSON.stringify({ path: file.id }) },
    });
    if (!res.ok) throw explain("download", res.status, await res.text());
    return { bytes: await res.arrayBuffer(), mime: res.headers.get("content-type") ?? "application/octet-stream" };
  },

  async upload(conn, folder, filename, bytes) {
    const res = await fetch(`${CONTENT}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Content-Type": "application/octet-stream",
        // Dropbox-API-Arg must be ASCII: escape anything outside it.
        "Dropbox-API-Arg": JSON.stringify({ path: `/${folder}/${filename}`, mode: "add", autorename: true, mute: true }).replace(
          /[\u007f-￿]/g,
          (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
        ),
      },
      body: bytes,
    });
    if (!res.ok) throw explain("upload", res.status, await res.text());
    const json = (await res.json()) as { id: string };
    return { id: json.id };
  },
};
