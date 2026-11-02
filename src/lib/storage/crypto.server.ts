// Server only. Encrypts storage tokens before they are written to the database.
//
// TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64 encoded:
//   openssl rand -base64 32

let keyPromise: Promise<CryptoKey> | null = null;

function key(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32");
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  keyPromise = crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  return keyPromise;
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** "v1.<iv>.<ciphertext>" using AES-256-GCM. */
export async function encryptToken(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain)));
  return `v1.${toB64(iv)}.${toB64(ct)}`;
}

export async function decryptToken(sealed: string): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Stored token is not in a readable format. Reconnect storage.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await key(), fromB64(ct));
  return new TextDecoder().decode(plain);
}
