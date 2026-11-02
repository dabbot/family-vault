import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/dropbox-inbound")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const challenge = url.searchParams.get("challenge") ?? "";
        return new Response(challenge, {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
      POST: async ({ request }) => {
        const secret = process.env.DROPBOX_APP_SECRET;
        if (!secret) {
          console.error("[dropbox-inbound] missing DROPBOX_APP_SECRET");
          return new Response("server misconfigured", { status: 500 });
        }
        const signature = request.headers.get("x-dropbox-signature") ?? "";
        const body = await request.text();
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sigBuf = Buffer.from(signature, "hex");
        const expBuf = Buffer.from(expected, "hex");
        if (
          sigBuf.length !== expBuf.length ||
          !timingSafeEqual(sigBuf, expBuf)
        ) {
          return new Response("Forbidden", { status: 403 });
        }
        try {
          const { connectionStatus } = await import("@/lib/storage/connection.server");
          const linked = await connectionStatus();
          if (linked?.provider !== "dropbox") return new Response("ok", { status: 200 });
          const { syncStorage } = await import("@/lib/storage/sync.server");
          const result = await syncStorage();
          console.log("[dropbox-inbound] sync result", { imported: result.imported, skipped: result.skipped, errors: result.errors.length });
        } catch (e) {
          console.error("[dropbox-inbound] sync failed", e);
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
