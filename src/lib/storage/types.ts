export type ProviderId = "dropbox" | "google_drive";

/** A file in the family's cloud folder. `path` is relative to the vault root: ["Alex", "Taxes", "itr.pdf"]. */
export type RemoteFile = { id: string; name: string; path: string[]; size: number | null };

export type TokenSet = { refreshToken: string; accessToken: string; expiresIn: number; accountLabel: string | null };

export type ConnectionState = {
  provider: ProviderId;
  accessToken: string;
  rootFolderId: string | null;
  cursor: string | null;
};

export interface StorageProvider {
  id: ProviderId;
  label: string;
  /** True when the server has the app credentials this provider needs. */
  configured(): boolean;
  authUrl(redirectUri: string, state: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>;
  /** Called once after connecting: creates the vault folder if needed and returns its id. */
  prepareRoot(accessToken: string): Promise<string | null>;
  /** Files changed since `cursor` (all files when cursor is null), plus the next cursor. */
  listChanges(conn: ConnectionState): Promise<{ files: RemoteFile[]; cursor: string }>;
  /** Every file currently in the vault folder. */
  listAll(conn: ConnectionState): Promise<RemoteFile[]>;
  download(conn: ConnectionState, file: RemoteFile): Promise<{ bytes: ArrayBuffer; mime: string }>;
  /** Uploads into <vault root>/<folder>/<filename>; returns the remote file id. */
  upload(conn: ConnectionState, folder: string, filename: string, bytes: ArrayBuffer, mime: string): Promise<{ id: string }>;
}
