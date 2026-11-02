// Server only. Checks the shared secret that scheduled jobs send.

/** Constant-time comparison so response timing does not reveal the secret. */
function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** True when the request carries CRON_SECRET in the x-cron-secret header. */
export function isAuthorisedCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  return safeEqual(request.headers.get("x-cron-secret") ?? "", expected);
}
