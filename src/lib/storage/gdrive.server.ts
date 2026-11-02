// Server only. Google Drive adapter.
//
// On connect the app creates (or reuses) a "Family Vault" folder in the family's Drive.
// Each family member and shared folder is a folder inside it:
//   Family Vault/Alex/passport.pdf, Family Vault/Car Insurance/policy.pdf
import type { ConnectionState, RemoteFile, StorageProvider, TokenSet } from "./types";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
// Full Drive access is needed so files the family adds to the folder by hand are visible too.
const SCOPES = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/userinfo.email"];
const ROOT_NAME = "Family Vault";
// Google Docs, Sheets and Slides have no file bytes; they are exported as PDF.
const EXPORT_AS_PDF = /^application\/vnd\.google-apps\.(document|spreadsheet|presentation|drawing)$/;

type DriveFile = { id: string; name: string; mimeType: string; parents?: string[]; size?: string; trashed?: boolean };

function creds() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error("Google is not set up on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  return { id, secret };
}

async function tokenRequest(body: Record<string, string>) {
  const { id, secret } = creds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in: number };
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Google Drive refused the request (${res.status}). Reconnect Google Drive. ${body.slice(0, 200)}`);
    }
    throw new Error(`Google Drive request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function children(token: string, parentId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${q(parentId)}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size)",
      pageSize: "1000",
      ...(pageToken ? { pageToken } : {}),
    });
    const page = await api<{ files: DriveFile[]; nextPageToken?: string }>(token, `/files?${params}`);
    out.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

async function findOrCreateFolder(token: string, name: string, parentId: string | null): Promise<string> {
  const parentQ = parentId ? `'${q(parentId)}' in parents` : "'root' in parents";
  const params = new URLSearchParams({
    q: `${parentQ} and name = '${q(name)}' and mimeType = '${FOLDER}' and trashed = false`,
    fields: "files(id)",
    pageSize: "1",
  });
  const found = await api<{ files: { id: string }[] }>(token, `/files?${params}`);
  if (found.files[0]) return found.files[0].id;
  const created = await api<{ id: string }>(token, "/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) }),
  });
  return created.id;
}

/** Walks up from a file to the vault root; null when the file is outside the vault folder. */
async function pathUnderRoot(token: string, file: DriveFile, rootId: string, cache: Map<string, DriveFile>): Promise<string[] | null> {
  const parts = [file.name];
  let parent = file.parents?.[0];
  for (let depth = 0; parent && depth < 20; depth++) {
    if (parent === rootId) return parts;
    let folder = cache.get(parent);
    if (!folder) {
      folder = await api<DriveFile>(token, `/files/${encodeURIComponent(parent)}?fields=id,name,parents`).catch(() => undefined);
      if (!folder) return null;
      cache.set(parent, folder);
    }
    parts.unshift(folder.name);
    parent = folder.parents?.[0];
  }
  return null;
}

const toRemote = (f: DriveFile, path: string[]): RemoteFile => ({
  id: f.id,
  name: EXPORT_AS_PDF.test(f.mimeType) ? `${f.name}.pdf` : f.name,
  path,
  size: f.size ? Number(f.size) : null,
});

function requireRoot(conn: ConnectionState): string {
  if (!conn.rootFolderId) throw new Error("The Family Vault folder in Google Drive is missing. Reconnect Google Drive.");
  return conn.rootFolderId;
}

export const googleDrive: StorageProvider = {
  id: "google_drive",
  label: "Google Drive",
  configured: () => !!(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()),

  authUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: creds().id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code, redirectUri): Promise<TokenSet> {
    const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
    if (!t.refresh_token) throw new Error("Google did not return a refresh token. Remove the app's access in your Google account and connect again.");
    const me = await api<{ email?: string }>(t.access_token, "https://www.googleapis.com/oauth2/v2/userinfo").catch(() => ({ email: undefined }));
    return { refreshToken: t.refresh_token, accessToken: t.access_token, expiresIn: t.expires_in, accountLabel: me.email ?? "Google Drive" };
  },

  async refresh(refreshToken) {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { accessToken: t.access_token, expiresIn: t.expires_in };
  },

  prepareRoot: (accessToken) => findOrCreateFolder(accessToken, ROOT_NAME, null),

  async listAll(conn) {
    const rootId = requireRoot(conn);
    const files: RemoteFile[] = [];
    const queue: { id: string; path: string[] }[] = [{ id: rootId, path: [] }];
    while (queue.length) {
      const dir = queue.shift()!;
      for (const f of await children(conn.accessToken, dir.id)) {
        if (f.mimeType === FOLDER) queue.push({ id: f.id, path: [...dir.path, f.name] });
        else if (!f.mimeType.startsWith("application/vnd.google-apps.") || EXPORT_AS_PDF.test(f.mimeType)) {
          files.push(toRemote(f, [...dir.path, f.name]));
        }
      }
    }
    return files;
  },

  async listChanges(conn) {
    const rootId = requireRoot(conn);
    if (!conn.cursor) {
      // First sync: take everything now, then follow the change feed from this point.
      const start = await api<{ startPageToken: string }>(conn.accessToken, "/changes/startPageToken");
      return { files: await googleDrive.listAll(conn), cursor: start.startPageToken };
    }
    const files: RemoteFile[] = [];
    const cache = new Map<string, DriveFile>();
    let pageToken: string | undefined = conn.cursor;
    let next = conn.cursor;
    while (pageToken) {
      const params: URLSearchParams = new URLSearchParams({
        pageToken,
        fields: "nextPageToken, newStartPageToken, changes(removed, file(id, name, mimeType, parents, size, trashed))",
        pageSize: "500",
      });
      const page: { changes: { removed?: boolean; file?: DriveFile }[]; nextPageToken?: string; newStartPageToken?: string } = await api<{ changes: { removed?: boolean; file?: DriveFile }[]; nextPageToken?: string; newStartPageToken?: string }>(
        conn.accessToken,
        `/changes?${params}`,
      );
      for (const c of page.changes) {
        const f = c.file;
        if (c.removed || !f || f.trashed || f.mimeType === FOLDER) continue;
        if (f.mimeType.startsWith("application/vnd.google-apps.") && !EXPORT_AS_PDF.test(f.mimeType)) continue;
        const path = await pathUnderRoot(conn.accessToken, f, rootId, cache);
        if (path) files.push(toRemote(f, path));
      }
      pageToken = page.nextPageToken;
      if (page.newStartPageToken) next = page.newStartPageToken;
    }
    return { files, cursor: next };
  },

  async download(conn, file) {
    const meta = await api<DriveFile>(conn.accessToken, `/files/${encodeURIComponent(file.id)}?fields=mimeType`);
    const url = EXPORT_AS_PDF.test(meta.mimeType)
      ? `${API}/files/${encodeURIComponent(file.id)}/export?mimeType=application/pdf`
      : `${API}/files/${encodeURIComponent(file.id)}?alt=media`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${conn.accessToken}` } });
    if (!res.ok) throw new Error(`Google Drive download failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const mime = EXPORT_AS_PDF.test(meta.mimeType) ? "application/pdf" : (res.headers.get("content-type") ?? meta.mimeType);
    return { bytes: await res.arrayBuffer(), mime };
  },

  async upload(conn, folder, filename, bytes, mime) {
    const parent = await findOrCreateFolder(conn.accessToken, folder, requireRoot(conn));
    const boundary = `vault${crypto.randomUUID()}`;
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: filename, parents: [parent] })}\r\n--${boundary}\r\nContent-Type: ${mime || "application/octet-stream"}\r\n\r\n`;
    const body = new Blob([head, bytes, `\r\n--${boundary}--`]);
    const created = await api<{ id: string }>(conn.accessToken, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return { id: created.id };
  },
};
